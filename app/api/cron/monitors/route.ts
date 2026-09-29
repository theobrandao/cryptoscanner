import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { assertCronAuth, recordCronRun } from "@/lib/cron";
import { evaluateMonitors } from "@/services/monitor-service";
import { getSetupRanking } from "@/services/market-overview-service";

export const maxDuration = 60;

/**
 * Ciclo dedicado do Market Monitor (agendar a cada 1–5 min com Authorization: Bearer <CRON_SECRET>).
 * Avalia monitores e, com tempo restante, aquece o ranking 4H do Market Scanner.
 */
async function handle(req: Request) {
  await connection();
  assertCronAuth(req);
  const t0 = Date.now();
  const monitors = await evaluateMonitors({ budgetMs: 40_000, batch: 120 });
  let warmed: number | null = null;
  if (Date.now() - t0 < 30_000) warmed = (await getSetupRanking("4h").catch(() => null))?.rows.length ?? null;
  await recordCronRun("monitors", t0, { ok: monitors.errors < Math.max(3, monitors.checked / 2), detail: { ...monitors, warmed } });
  return ok({ ranAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, monitors, warmed });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
