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
    // retenção: 14 dias
    await prisma.cronRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - 14 * 24 * 3600_000) } } });
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
