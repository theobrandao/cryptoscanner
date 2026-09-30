import { timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { getCache } from "@/lib/cache";
import { ApiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Autenticação dos endpoints agendados: `Authorization: Bearer <CRON_SECRET>`.
 * `?secret=` só é aceito enquanto CRON_ALLOW_QUERY_SECRET=true (segredo em URL aparece em logs).
 */
export function assertCronAuth(req: Request): void {
  const env = getEnv();
  const secret = env.CRON_SECRET;
  if (!secret) throw new ApiError(503, "CRON_SECRET não configurado", "cron_disabled");
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = env.CRON_ALLOW_QUERY_SECRET ? new URL(req.url).searchParams.get("secret") : null;
  const provided = header ?? query ?? "";
  if (!provided || !safeEqual(provided, secret)) throw new ApiError(401, "Segredo inválido", "unauthorized");
}

/**
 * Trava por job (INCR atômico com TTL no cache): a mesma rotina agendada por dois lugares (Vercel Cron e um
 * agendador externo) ou dois disparos sobrepostos não rodam em paralelo — o segundo é ignorado (HTTP 200 "skipped").
 * O TTL cobre o tempo máximo da função; em falha sem liberar, a trava expira sozinha.
 */
export async function acquireCronLock(job: string, ttlSeconds: number): Promise<boolean> {
  try {
    return (await getCache().incr(`cron:lock:${job}`, ttlSeconds)) === 1;
  } catch {
    return true; // cache indisponível: não bloqueia a rotina
  }
}

export async function releaseCronLock(job: string): Promise<void> {
  await getCache().del(`cron:lock:${job}`).catch(() => undefined);
}

/** Envolve a rotina com a trava; devolve null quando outra execução está em andamento. */
export async function withCronLock<T>(job: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | null> {
  if (!(await acquireCronLock(job, ttlSeconds))) {
    log.info("execução ignorada: job já em andamento", { job });
    return null;
  }
  try {
    return await fn();
  } finally {
    await releaseCronLock(job);
  }
}

/** Falhas consecutivas que disparam aviso ao administrador. */
export const FAILURE_ALERT_THRESHOLD = 3;

export interface CronOutcome {
  ok: boolean;
  detail?: unknown;
}

/**
 * Registra a execução (heartbeat) e, após N falhas seguidas do mesmo job, avisa os administradores
 * (push no navegador). O aviso é enviado uma vez por sequência de falhas (exatamente na N-ésima).
 */
export async function recordCronRun(job: string, startedAt: number, outcome: CronOutcome): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.cronRun.create({
      data: { job, ok: outcome.ok, durationMs: Date.now() - startedAt, detail: (outcome.detail ?? undefined) as Prisma.InputJsonValue | undefined, startedAt: new Date(startedAt) },
    });
    // retenção (14 dias) fica em services/retention-service.ts, fora do caminho de cada execução
    if (outcome.ok) return;
    const recent = await prisma.cronRun.findMany({ where: { job }, orderBy: { startedAt: "desc" }, take: FAILURE_ALERT_THRESHOLD + 1, select: { ok: true } });
    const failuresInRow = recent.findIndex((r) => r.ok);
    const streak = failuresInRow === -1 ? recent.length : failuresInRow;
    if (streak === FAILURE_ALERT_THRESHOLD) {
      const { notifyAdmins } = await import("@/services/push-service");
      await notifyAdmins({ title: `Falha no job ${job}`, body: `${FAILURE_ALERT_THRESHOLD} execuções seguidas falharam. Ver /status.`, url: "/status", tag: `cron-${job}` });
    }
  } catch (err) {
    log.warn("registro de execução falhou", { job, error: (err as Error).message });
  }
}

/**
 * Orçamento de tempo compartilhado pelas etapas de um ciclo agendado. Cada etapa pergunta quanto sobra e
 * reserva a margem que as etapas seguintes (e o registro final) precisam; ao estourar, a etapa para de iniciar trabalho novo.
 */
export class Deadline {
  readonly startedAt: number;
  readonly endsAt: number;

  constructor(totalMs: number, private readonly clock: () => number = Date.now) {
    this.startedAt = clock();
    this.endsAt = this.startedAt + totalMs;
  }

  /** ms restantes (nunca negativo). */
  remaining(): number {
    return Math.max(0, this.endsAt - this.clock());
  }

  elapsed(): number {
    return this.clock() - this.startedAt;
  }

  /** true quando sobram menos de `reserveMs` (tempo guardado para o que vem depois). */
  expired(reserveMs = 0): boolean {
    return this.remaining() <= reserveMs;
  }

  /** Orçamento para uma etapa: o que sobra menos a reserva, limitado a `capMs`. */
  budget(reserveMs = 0, capMs = Number.POSITIVE_INFINITY): number {
    return Math.max(0, Math.min(capMs, this.remaining() - reserveMs));
  }
}

/**
 * Processa `items` com no máximo `concurrency` tarefas simultâneas. Antes de iniciar cada item consulta `shouldStop`
 * (orçamento de tempo); itens não iniciados ficam para o próximo ciclo. Erro de um item não interrompe os demais.
 */
export async function runWithConcurrency<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>, shouldStop: () => boolean = () => false): Promise<{ results: R[]; errors: Array<{ item: T; error: Error }>; skipped: number }> {
  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < items.length) {
      if (shouldStop()) {
        stopped = true;
        break;
      }
      const item = items[next++] as T;
      try {
        results.push(await fn(item));
      } catch (err) {
        errors.push({ item, error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return { results, errors, skipped: items.length - next };
}
