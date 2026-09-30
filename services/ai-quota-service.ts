import { getPrisma } from "@/database/client";
import { ApiError, UNAVAILABLE_MESSAGE } from "@/lib/api";
import { TIER_LIMITS, type Tier } from "@/lib/access-policy";
import { createLogger } from "@/lib/logger";
import { rateLimitHeaders, withControlStore } from "@/lib/rate-limit";

const log = createLogger("ai-quota");

/**
 * Cota diária do Analista IA (mesmos limites do plano: `aiQueriesPerDay`), única para as duas rotas do Analista.
 * - Debitada só quando o modelo de linguagem vai de fato ser chamado; estornada se a chamada falhar.
 * - O dia vira à meia-noite de Brasília (America/Sao_Paulo), não às 21h (UTC).
 * - Contador no Redis quando disponível; sem Redis, no Postgres (`AiUsage`, upsert com incremento atômico).
 *   Em produção nunca conta na memória da instância.
 */
export const AI_QUOTA_TIMEZONE = "America/Sao_Paulo";
const KEY_TTL_MS = 26 * 3600 * 1000;

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: AI_QUOTA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const wallFormat = new Intl.DateTimeFormat("en-CA", { timeZone: AI_QUOTA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** Dia da cota (AAAA-MM-DD) no fuso de Brasília. */
export function quotaDay(now = new Date()): string {
  return dayFormat.format(now);
}

/** Instante (epoch ms) da próxima meia-noite em Brasília, quando a cota renova. */
export function nextQuotaReset(now = new Date()): number {
  const p = Object.fromEntries(wallFormat.formatToParts(now).map((x) => [x.type, x.value])) as Record<string, string>;
  const wallAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1) - offsetMs;
}

export interface AiQuotaTicket {
  used: number;
  limit: number;
  remaining: number;
  day: string;
  storage: "redis" | "memory" | "postgres";
  /** Estorna o débito (falha do modelo). Idempotente. */
  refund(): Promise<void>;
}

type Counter = { storage: AiQuotaTicket["storage"]; used: number; undo: () => Promise<void> };

async function increment(userId: string, day: string): Promise<Counter> {
  const key = `aiquota:${userId}:${day}`;
  const r = await withControlStore((s) => s.incr(key, KEY_TTL_MS));
  if (r.ok) {
    const store = r.store;
    return { storage: store.kind, used: r.value.count, undo: () => store.decr(key) };
  }
  const prisma = getPrisma();
  if (!prisma) {
    log.error("cota da IA sem Redis e sem banco; consulta recusada");
    throw new ApiError(503, UNAVAILABLE_MESSAGE, "service_unavailable");
  }
  log.warn("cota da IA contada no Postgres (Redis indisponível)");
  const row = await prisma.aiUsage.upsert({ where: { userId_day: { userId, day } }, create: { userId, day, count: 1 }, update: { count: { increment: 1 } }, select: { count: true } });
  return {
    storage: "postgres",
    used: row.count,
    undo: async () => {
      await prisma.aiUsage.updateMany({ where: { userId, day, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
    },
  };
}

/**
 * Debita 1 consulta da cota do dia. Acima do limite, desfaz o débito e responde 429 `ai_quota` com Retry-After
 * até a meia-noite de Brasília. Chame só quando o modelo for realmente usado e estorne com `ticket.refund()` em falha.
 */
export async function consumeAiQuota(userId: string, tier: Tier, now = new Date()): Promise<AiQuotaTicket> {
  const limit = TIER_LIMITS[tier].aiQueriesPerDay;
  const day = quotaDay(now);
  const resetAt = nextQuotaReset(now);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
  const c = await increment(userId, day);
  if (c.used > limit) {
    await c.undo().catch((err: unknown) => log.warn("falha ao desfazer débito acima do limite", { error: (err as Error).message }));
    throw new ApiError(429, `Você usou as ${limit} consultas de hoje ao Analista IA. A cota renova à meia-noite (horário de Brasília).`, "ai_quota", { limit, resetAt, retryAfter: retryAfterSeconds }, rateLimitHeaders({ limit, remaining: 0, resetAt, retryAfterSeconds }, true));
  }
  let refunded = false;
  return {
    used: c.used,
    limit,
    remaining: Math.max(0, limit - c.used),
    day,
    storage: c.storage,
    async refund() {
      if (refunded) return;
      refunded = true;
      try {
        await c.undo();
      } catch (err) {
        log.warn("falha ao estornar a cota da IA", { error: (err as Error).message });
      }
    },
  };
}
