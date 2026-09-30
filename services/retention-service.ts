import { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { getCache } from "@/lib/cache";
import type { Deadline } from "@/lib/cron";
import { createLogger } from "@/lib/logger";

const log = createLogger("retention");

const DAY_MS = 86_400_000;
/** Linhas por DELETE: lotes curtos não seguram trava nem estouram o tempo da função. */
export const RETENTION_BATCH = 5000;
/** A limpeza roda no máximo uma vez por hora (chave com NX no cache). */
export const RETENTION_INTERVAL_SECONDS = 3600;
const RETENTION_KEY = "retention:last-run";

export interface RetentionRule {
  table: string;
  column: string;
  /** apaga linhas com `column` anterior a agora − maxAgeMs */
  maxAgeMs: number;
}

/**
 * Prazos aprovados (docs/plans/2026-09-30-melhorias.md). BillingEvent e AdminAuditLog não são apagados;
 * AccessLog (190 dias) segue em services/access-log-service.ts. A ordem importa: AgentResult antes de AgentExecution.
 */
export const RETENTION_RULES: readonly RetentionRule[] = [
  { table: "ScannerResult", column: "detectedAt", maxAgeMs: 2 * DAY_MS },
  { table: "MarketSnapshot", column: "collectedAt", maxAgeMs: 7 * DAY_MS },
  { table: "CronRun", column: "startedAt", maxAgeMs: 14 * DAY_MS },
  { table: "PasswordReset", column: "expiresAt", maxAgeMs: 7 * DAY_MS },
  { table: "AgentLog", column: "createdAt", maxAgeMs: 90 * DAY_MS },
  { table: "AgentResult", column: "createdAt", maxAgeMs: 90 * DAY_MS },
  { table: "AgentExecution", column: "startedAt", maxAgeMs: 90 * DAY_MS },
  { table: "MonitorEvent", column: "createdAt", maxAgeMs: 180 * DAY_MS },
  { table: "ScanHistoryEntry", column: "createdAt", maxAgeMs: 180 * DAY_MS },
  { table: "AnalyticsEvent", column: "createdAt", maxAgeMs: 365 * DAY_MS },
];

type Executor = (sql: Prisma.Sql) => Promise<number>;

/** DELETE de até `limit` linhas vencidas (subconsulta com LIMIT usa o índice da coluna de data). */
export function batchDeleteSql(rule: RetentionRule, cutoff: Date, limit = RETENTION_BATCH): Prisma.Sql {
  const t = Prisma.raw(`"${rule.table}"`);
  const c = Prisma.raw(`"${rule.column}"`);
  return Prisma.sql`DELETE FROM ${t} WHERE "id" IN (SELECT "id" FROM ${t} WHERE ${c} < ${cutoff} LIMIT ${limit})`;
}

export interface RetentionResult {
  deleted: Record<string, number>;
  /** regras não concluídas por falta de tempo (continuam na próxima rodada) */
  incomplete: string[];
  errors: string[];
}

/**
 * Apaga em lotes as linhas fora do prazo de cada regra, parando quando o orçamento de tempo acaba.
 * Função pura sobre o executor (testável sem banco).
 */
export async function purgeOldRows(exec: Executor, opts: { now?: Date; shouldStop?: () => boolean; rules?: readonly RetentionRule[]; batch?: number } = {}): Promise<RetentionResult> {
  const now = opts.now ?? new Date();
  const batch = opts.batch ?? RETENTION_BATCH;
  const shouldStop = opts.shouldStop ?? (() => false);
  const out: RetentionResult = { deleted: {}, incomplete: [], errors: [] };
  for (const rule of opts.rules ?? RETENTION_RULES) {
    const cutoff = new Date(now.getTime() - rule.maxAgeMs);
    let total = 0;
    try {
      for (;;) {
        if (shouldStop()) {
          out.incomplete.push(rule.table);
          break;
        }
        const n = await exec(batchDeleteSql(rule, cutoff, batch));
        total += n;
        if (n < batch) break;
      }
    } catch (err) {
      out.errors.push(`${rule.table}: ${(err as Error).message}`);
      log.warn("limpeza falhou", { table: rule.table, error: (err as Error).message });
    }
    if (total) out.deleted[rule.table] = total;
  }
  return out;
}

/**
 * Etapa de retenção do ciclo do cron: no máximo 1×/hora (SET NX no cache) e dentro do tempo que sobra do ciclo.
 * Se o tempo acabar no meio, o restante sai na próxima rodada (os lotes são independentes).
 */
export async function runRetention(opts: { deadline?: Deadline; reserveMs?: number; now?: Date } = {}): Promise<RetentionResult | { skipped: string }> {
  const prisma = getPrisma();
  if (!prisma) return { skipped: "sem banco" };
  const first = await getCache()
    .setNX(RETENTION_KEY, Date.now(), RETENTION_INTERVAL_SECONDS * 1000)
    .catch(() => false);
  if (!first) return { skipped: "executada na última hora" };
  const reserve = opts.reserveMs ?? 3_000;
  const res = await purgeOldRows((sql) => prisma.$executeRaw(sql), { now: opts.now, shouldStop: () => (opts.deadline ? opts.deadline.expired(reserve) : false) });
  // faltou tempo: libera a chave para o próximo ciclo continuar de onde parou
  if (res.incomplete.length) await getCache().del(RETENTION_KEY).catch(() => undefined);
  log.info("retenção", { ...res.deleted, incomplete: res.incomplete.join(",") || undefined });
  return res;
}
