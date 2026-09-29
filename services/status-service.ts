import { checkDatabase, getPrisma } from "@/database/client";
import { getCache } from "@/lib/cache";
import { isLlmConfigured, isTelegramConfigured } from "@/lib/env";
import { getProviderHealth } from "@/services/market/market-service";
import { isPushConfigured } from "@/services/push-service";
import type { ProviderHealth } from "@/types/market";

/** Intervalo esperado de cada job (min) — acima de 3× o job é considerado atrasado. */
export const JOB_INTERVAL_MIN: Record<string, number> = { cycle: 5, whales: 10, backtest: 24 * 60 };

export interface JobStatus {
  job: string;
  expectedEveryMin: number;
  lastRunAt: number | null;
  lastOkAt: number | null;
  lastDurationMs: number | null;
  failureStreak: number;
  runs24h: number;
  okRate24h: number | null;
  state: "ok" | "late" | "failing" | "never";
}

export interface SystemStatus {
  overall: "ok" | "degraded" | "down";
  checkedAt: number;
  database: Awaited<ReturnType<typeof checkDatabase>>;
  cache: string;
  providers: ProviderHealth[];
  jobs: JobStatus[];
  integrations: { llm: boolean; telegram: boolean; push: boolean };
}

async function jobStatuses(): Promise<JobStatus[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const since = new Date(Date.now() - 24 * 3600_000);
  const out: JobStatus[] = [];
  for (const [job, every] of Object.entries(JOB_INTERVAL_MIN)) {
    const [recent, lastOk, day] = await Promise.all([
      prisma.cronRun.findMany({ where: { job }, orderBy: { startedAt: "desc" }, take: 20, select: { ok: true, startedAt: true, durationMs: true } }),
      prisma.cronRun.findFirst({ where: { job, ok: true }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      prisma.cronRun.groupBy({ by: ["ok"], where: { job, startedAt: { gte: since } }, _count: { _all: true } }),
    ]);
    const last = recent[0];
    const firstOk = recent.findIndex((r) => r.ok);
    const failureStreak = firstOk === -1 ? recent.length : firstOk;
    const runs24h = day.reduce((s, g) => s + g._count._all, 0);
    const ok24h = day.find((g) => g.ok)?._count._all ?? 0;
    let state: JobStatus["state"] = "ok";
    if (!last) state = "never";
    else if (failureStreak >= 3) state = "failing";
    else if (Date.now() - last.startedAt.getTime() > every * 3 * 60_000) state = "late";
    out.push({
      job,
      expectedEveryMin: every,
      lastRunAt: last?.startedAt.getTime() ?? null,
      lastOkAt: lastOk?.startedAt.getTime() ?? null,
      lastDurationMs: last?.durationMs ?? null,
      failureStreak,
      runs24h,
      okRate24h: runs24h ? ok24h / runs24h : null,
      state,
    });
  }
  return out;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const [database, providers, jobs, push] = await Promise.all([checkDatabase(), getProviderHealth(), jobStatuses().catch(() => []), isPushConfigured()]);
  const anyProvider = providers.some((p) => p.ok);
  const cycle = jobs.find((j) => j.job === "cycle");
  let overall: SystemStatus["overall"] = "ok";
  if (!anyProvider) overall = "down";
  else if (!database.ok || providers.some((p) => !p.ok) || jobs.some((j) => j.state === "failing" || (j.job !== "backtest" && j.state === "late")) || cycle?.state === "never") overall = "degraded";
  return {
    overall,
    checkedAt: Date.now(),
    database,
    cache: getCache().kind(),
    providers,
    jobs,
    integrations: { llm: isLlmConfigured(), telegram: isTelegramConfigured(), push },
  };
}
