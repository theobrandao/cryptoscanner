import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getPatternStats, STATS_TIMEFRAMES } from "@/services/pattern-stats-service";

const querySchema = z.object({ timeframe: z.enum(STATS_TIMEFRAMES).default("1d") });

/** Taxa de acerto por padrão: backtest walk-forward + sinais acompanhados ao vivo. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const { timeframe } = parseQuery(req, querySchema);
  return ok(await getPatternStats(timeframe));
});
