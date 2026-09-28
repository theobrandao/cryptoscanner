import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { autoFibonacci, fibonacciLevels } from "@/lib/fibonacci";
import { parseTimeframe } from "@/lib/timeframes";
import { getCandles } from "@/services/market/market-service";

const querySchema = z.object({
  symbol: symbolSchema.optional(),
  timeframe: z.string().default("1d"),
  lookback: z.coerce.number().int().min(10).max(500).default(60),
  high: z.coerce.number().positive().optional(),
  low: z.coerce.number().positive().optional(),
  direction: z.enum(["up", "down"]).optional(),
});

/** Níveis de Fibonacci: manual (high/low/direction) ou automáticos pelo swing do ativo. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  if (q.high && q.low && q.direction) return ok({ mode: "manual", result: fibonacciLevels(q.high, q.low, q.direction) });
  if (!q.symbol) return ok({ mode: "manual", result: null });
  const series = await getCandles(q.symbol, parseTimeframe(q.timeframe), { limit: Math.max(q.lookback, 60) });
  const result = autoFibonacci(series.candles, q.lookback);
  const lastPrice = series.candles[series.candles.length - 1]?.close ?? null;
  return ok({ mode: "auto", symbol: q.symbol, timeframe: series.timeframe, source: series.source, stale: series.stale, price: lastPrice, result });
});
