import { z } from "zod";
import { defineAgent } from "@/agents/runtime";
import { candleSchema, directionSchema, symbolSchema, timeframeSchema } from "@/agents/schemas";
import type { IndicatorTools, MarketTools } from "@/agents/tools";
import { round } from "@/lib/indicators/core";
import type { Timeframe } from "@/types/market";

/**
 * TREND AGENT
 * Classifica a tendência no timeframe analisado e no timeframe superior (contexto),
 * medindo alinhamento entre eles e a estrutura das médias (EMA 8/25/100/200).
 */
const HIGHER: Record<Timeframe, Timeframe | null> = {
  "5m": "1h",
  "15m": "1h",
  "30m": "4h",
  "1h": "4h",
  "4h": "1d",
  "1d": "1w",
  "1w": null,
};

export const trendInputSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  candles: z.array(candleSchema).min(40),
});

const trendLevelSchema = z.object({
  timeframe: timeframeSchema,
  trend: directionSchema,
  strength: z.number().min(0).max(100),
  emaStack: z.enum(["bullish", "bearish", "mixed"]),
  slopePct: z.number().or(z.nan()),
  source: z.string().optional(),
});

export const trendOutputSchema = z.object({
  symbol: z.string(),
  primary: trendLevelSchema,
  higher: trendLevelSchema.nullable(),
  /** aligned = ambos na mesma direção; conflicting = opostos; partial = um neutro */
  alignment: z.enum(["aligned", "partial", "conflicting", "unknown"]),
  overall: directionSchema,
  confidence: z.number().min(0).max(100),
  explanation: z.string(),
});

export type TrendInput = z.infer<typeof trendInputSchema>;
export type TrendOutput = z.infer<typeof trendOutputSchema>;

function emaStack(s: { ema8: number; ema25: number; ema100: number }): "bullish" | "bearish" | "mixed" {
  const f = (v: number) => Number.isFinite(v);
  if (!f(s.ema8) || !f(s.ema25) || !f(s.ema100)) return "mixed";
  if (s.ema8 > s.ema25 && s.ema25 > s.ema100) return "bullish";
  if (s.ema8 < s.ema25 && s.ema25 < s.ema100) return "bearish";
  return "mixed";
}

export const trendAgent = defineAgent<TrendInput, TrendOutput>({
  name: "trend-agent",
  purpose: "Classificar a tendência no timeframe analisado e no superior, medindo alinhamento e força.",
  inputs: ["symbol", "timeframe", "candles"],
  outputs: ["primary", "higher", "alignment", "overall", "confidence", "explanation"],
  allowedTools: ["indicators", "market"],
  rules: ["O timeframe superior só é consultado via ferramenta de mercado; falha nele não invalida o primário.", "Alinhamento entre timeframes aumenta a confiança; conflito reduz."],
  timeoutMs: 15_000,
  inputSchema: trendInputSchema,
  outputSchema: trendOutputSchema,

  async run(input, ctx) {
    const indicators = ctx.tools.use<IndicatorTools>("indicators");
    const market = ctx.tools.use<MarketTools>("market");
    const snap = indicators.snapshot(input.candles);
    const primary = {
      timeframe: input.timeframe,
      trend: snap.trend,
      strength: snap.trendStrength,
      emaStack: emaStack(snap),
      slopePct: snap.slopePct,
    };
    let higher: TrendOutput["higher"] = null;
    const higherTf = HIGHER[input.timeframe];
    if (higherTf) {
      try {
        const series = await market.getCandles(input.symbol, higherTf, 200);
        const hs = indicators.snapshot(series.candles);
        higher = { timeframe: higherTf, trend: hs.trend, strength: hs.trendStrength, emaStack: emaStack(hs), slopePct: hs.slopePct, source: series.source };
      } catch (err) {
        ctx.log("warn", "timeframe superior indisponível", { higherTf, error: (err as Error).message });
      }
    }
    let alignment: TrendOutput["alignment"] = "unknown";
    if (higher) {
      if (primary.trend === higher.trend && primary.trend !== "neutral") alignment = "aligned";
      else if (primary.trend !== "neutral" && higher.trend !== "neutral") alignment = "conflicting";
      else alignment = "partial";
    }
    let overall = primary.trend;
    let confidence = primary.strength;
    if (alignment === "aligned") confidence = Math.min(100, confidence + 20);
    if (alignment === "conflicting") {
      confidence = Math.max(0, confidence - 25);
      overall = "neutral";
    }
    if (higher && primary.trend === "neutral" && higher.trend !== "neutral") overall = higher.trend;
    const explanation =
      `Tendência ${input.timeframe}: ${primary.trend} (força ${primary.strength}, EMAs ${primary.emaStack}, inclinação ${round(primary.slopePct, 3)}%/barra)` +
      (higher ? `; ${higher.timeframe}: ${higher.trend} (força ${higher.strength}) — alinhamento ${alignment}.` : "; sem timeframe superior.");
    ctx.log("info", "tendência classificada", { overall, alignment, confidence });
    return { symbol: input.symbol, primary, higher, alignment, overall, confidence, explanation };
  },

  fallback(input, ctx) {
    // Sem ferramentas: classifica apenas pelo primário já calculável a partir dos candles recebidos.
    const indicators = ctx.tools.use<IndicatorTools>("indicators");
    const snap = indicators.snapshot(input.candles);
    return {
      symbol: input.symbol,
      primary: { timeframe: input.timeframe, trend: snap.trend, strength: snap.trendStrength, emaStack: emaStack(snap), slopePct: snap.slopePct },
      higher: null,
      alignment: "unknown",
      overall: snap.trend,
      confidence: Math.max(0, snap.trendStrength - 10),
      explanation: "Fallback: tendência calculada apenas no timeframe primário.",
    };
  },
});
