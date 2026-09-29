import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { assertCronAuth, recordCronRun } from "@/lib/cron";
import { computeBacktest, STATS_TIMEFRAMES } from "@/services/pattern-stats-service";

export const maxDuration = 60;

/** Backtest walk-forward diário de todos os padrões (4H e 1D). Agendar 1×/dia no QStash. */
async function handle(req: Request) {
  await connection();
  assertCronAuth(req);
  const t0 = Date.now();
  const out: Record<string, unknown> = {};
  let okAll = true;
  for (const tf of STATS_TIMEFRAMES) {
    try {
      const r = await computeBacktest(tf, { timeBudgetMs: 25_000 });
      out[tf] = { assets: r.assets, trades: r.totalTrades, patterns: r.stats.length };
    } catch (err) {
      okAll = false;
      out[tf] = { error: (err as Error).message };
    }
  }
  await recordCronRun("backtest", t0, { ok: okAll, detail: out });
  return ok({ ranAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, result: out });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
