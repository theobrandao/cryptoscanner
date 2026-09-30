import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { assertCronAuth, recordCronRun, withCronLock } from "@/lib/cron";
import { evaluateMonitors } from "@/services/monitor-service";
import { getSetupRanking } from "@/services/market-overview-service";

export const maxDuration = 60;

/**
 * Ciclo dedicado do Market Monitor (Vercel Cron a cada 5 min, defasado do ciclo principal).
 * Avalia monitores e, com tempo restante, aquece o ranking 4H do Market Scanner.
 */
async function handle(req: Request) {
  await connection();
  assertCronAuth(req);
  const res = await withCronLock("monitors", maxDuration, async () => {
    const t0 = Date.now();
    let monitors: Awaited<ReturnType<typeof evaluateMonitors>> | null = null;
    let warmed: number | null = null;
    let error: string | undefined;
    try {
      monitors = await evaluateMonitors({ budgetMs: 40_000, batch: 120, concurrency: 4 });
      if (Date.now() - t0 < 30_000) warmed = (await getSetupRanking("4h").catch(() => null))?.rows.length ?? null;
      return ok({ ranAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, monitors, warmed });
    } catch (err) {
      error = (err as Error).message;
      throw err;
    } finally {
      // registrado mesmo quando a avaliação lança (o /status mostra a falha em vez de um buraco)
      await recordCronRun("monitors", t0, { ok: monitors !== null && monitors.errors < Math.max(3, monitors.checked / 2), detail: monitors ? { ...monitors, warmed } : { error } });
    }
  });
  return res ?? ok({ skipped: "running" });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
