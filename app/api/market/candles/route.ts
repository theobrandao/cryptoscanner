import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { parseTimeframe } from "@/lib/timeframes";
import { getCandles } from "@/services/market/market-service";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { bollinger, ema, macd, stochRsi } from "@/lib/indicators/core";
import { requireCoreUser } from "@/services/subscription-service";

const querySchema = z.object({
  symbol: symbolSchema,
  timeframe: z.string().default("4h"),
  limit: z.coerce.number().int().min(50).max(600).default(300),
  indicators: z.enum(["1", "0"]).default("0"),
});

/** Candles normalizados + (opcional) séries de indicadores para o gráfico. */
export const GET = withApi(async (req) => {
  await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const tf = parseTimeframe(q.timeframe);
  // exibição: inclui o candle em formação; o snapshot (sinais) usa só os fechados
  const series = await getCandles(q.symbol, tf, { limit: q.limit, includeForming: true });
  const closed = series.forming ? series.candles.slice(0, -1) : series.candles;
  if (q.indicators !== "1") return ok(series);
  const closes = series.candles.map((c) => c.close);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const st = stochRsi(closes);
  const nan = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : v);
  return ok({
    ...series,
    snapshot: JSON.parse(JSON.stringify(computeSnapshot(closed), (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v))),
    series: {
      ema8: ema(closes, 8).map(nan),
      ema25: ema(closes, 25).map(nan),
      ema100: ema(closes, 100).map(nan),
      ema200: ema(closes, 200).map(nan),
      bbUpper: bb.upper.map(nan),
      bbMiddle: bb.middle.map(nan),
      bbLower: bb.lower.map(nan),
      macd: m.macd.map(nan),
      macdSignal: m.signal.map(nan),
      macdHist: m.histogram.map(nan),
      stochK: st.k.map(nan),
      stochD: st.d.map(nan),
    },
  });
});
