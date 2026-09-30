import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getPatternStats, STATS_TIMEFRAMES } from "@/services/pattern-stats-service";
import { requireCoreUser } from "@/services/subscription-service";

const querySchema = z.object({
  timeframe: z.enum(STATS_TIMEFRAMES).default("1d"),
  symbol: z.string().regex(/^[A-Z0-9*]{1,10}$/).default("*"),
  regime: z.enum(["*", "bull", "bear", "range"]).default("*"),
});

/** Taxa de acerto por padrão: backtest walk-forward + sinais acompanhados ao vivo. */
export const GET = withApi(async (req) => {
  await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const { timeframe, symbol, regime } = parseQuery(req, querySchema);
  return ok(await getPatternStats(timeframe, { symbol, regime }));
});
