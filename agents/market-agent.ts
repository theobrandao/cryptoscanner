import { z } from "zod";
import { defineAgent } from "@/agents/runtime";
import { candleSchema, provenanceSchema, symbolSchema, tickerSchema, timeframeSchema } from "@/agents/schemas";
import type { MarketTools } from "@/agents/tools";
import { TIMEFRAME_MS } from "@/lib/timeframes";

/**
 * MARKET AGENT
 * Propósito: obter e validar a série de candles e o ticker de um ativo, com proveniência
 * (fonte, data, obsolescência) e métricas de qualidade de dados (lacunas, idade).
 */
export const marketInputSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  limit: z.number().int().min(50).max(1000).default(300),
});

export const marketOutputSchema = z.object({
  symbol: z.string(),
  timeframe: timeframeSchema,
  candles: z.array(candleSchema).min(1),
  ticker: tickerSchema.nullable(),
  provenance: provenanceSchema,
  quality: z.object({
    candles: z.number(),
    gaps: z.number(),
    lastCandleAgeMs: z.number(),
    /** true quando o último candle ainda está aberto */
    lastCandleOpen: z.boolean(),
    sufficientForIndicators: z.boolean(),
  }),
});

export type MarketInput = z.infer<typeof marketInputSchema>;
export type MarketOutput = z.infer<typeof marketOutputSchema>;

export const marketAgent = defineAgent<MarketInput, MarketOutput>({
  name: "market-agent",
  purpose: "Coletar candles e ticker com fallback de provedor, anotando origem, data e qualidade dos dados.",
  inputs: ["symbol", "timeframe", "limit"],
  outputs: ["candles", "ticker", "provenance", "quality"],
  allowedTools: ["market"],
  rules: ["Nunca inventar candles; lacunas são reportadas, não preenchidas.", "Sempre informar a fonte e se o dado é obsoleto (stale).", "Um ticker ausente não invalida a série de candles."],
  timeoutMs: 15_000,
  inputSchema: marketInputSchema,
  outputSchema: marketOutputSchema,

  async run(input, ctx) {
    const market = ctx.tools.use<MarketTools>("market");
    const series = await market.getCandles(input.symbol, input.timeframe, input.limit);
    let ticker = null;
    try {
      ticker = (await market.getTicker(input.symbol)) ?? null;
    } catch (err) {
      ctx.log("warn", "ticker indisponível", { error: (err as Error).message });
    }
    const span = TIMEFRAME_MS[input.timeframe];
    let gaps = 0;
    for (let i = 1; i < series.candles.length; i++) {
      const prev = series.candles[i - 1];
      const cur = series.candles[i];
      if (prev && cur && cur.openTime - prev.openTime > span * 1.5) gaps++;
    }
    const lastCandle = series.candles[series.candles.length - 1];
    const lastAge = lastCandle ? ctx.now - lastCandle.openTime : Number.MAX_SAFE_INTEGER;
    ctx.log("info", "série obtida", { source: series.source, candles: series.candles.length, stale: series.stale, gaps });
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles: series.candles,
      ticker,
      provenance: { source: series.source, asOf: series.fetchedAt, stale: series.stale },
      quality: {
        candles: series.candles.length,
        gaps,
        lastCandleAgeMs: lastAge,
        lastCandleOpen: lastCandle ? lastCandle.closeTime > ctx.now : false,
        sufficientForIndicators: series.candles.length >= 60,
      },
    };
  },
});
