import { z } from "zod";
import { defineAgent } from "@/agents/runtime";
import { candleSchema, directionSchema, patternMatchSchema, snapshotSchema, symbolSchema, timeframeSchema } from "@/agents/schemas";
import type { IndicatorTools, PatternTools } from "@/agents/tools";
import { round } from "@/lib/indicators/core";

/**
 * TECHNICAL ANALYSIS AGENT
 * Recebe ativo, timeframe e candles; calcula indicadores e padrões programaticamente
 * e devolve JSON estruturado (tendência, momentum, suportes, resistências, sinais, confiança, explicação).
 * A "confiança" mede coerência entre indicadores — não é probabilidade de lucro.
 */
export const taInputSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  candles: z.array(candleSchema).min(40),
  minPatternConfidence: z.number().min(0).max(100).default(60),
});

export const signalSchema = z.object({
  code: z.string(),
  label: z.string(),
  direction: directionSchema,
  /** peso 1..3 usado na agregação */
  weight: z.number().min(1).max(3),
  detail: z.string(),
});

export const taOutputSchema = z.object({
  asset: z.string(),
  timeframe: timeframeSchema,
  trend: directionSchema,
  momentum: z.enum(["strong_up", "up", "flat", "down", "strong_down"]),
  support: z.array(z.number()),
  resistance: z.array(z.number()),
  signals: z.array(signalSchema),
  patterns: z.array(patternMatchSchema),
  indicators: snapshotSchema,
  /** 0..100: coerência entre sinais (quanto mais sinais na mesma direção, maior) */
  confidence: z.number().min(0).max(100),
  bias: directionSchema,
  explanation: z.string(),
});

export type TaInput = z.infer<typeof taInputSchema>;
export type TaOutput = z.infer<typeof taOutputSchema>;
export type TaSignal = z.infer<typeof signalSchema>;

export function buildSignals(s: z.infer<typeof snapshotSchema>): TaSignal[] {
  const out: TaSignal[] = [];
  const f = (v: number) => Number.isFinite(v);

  if (f(s.ema8) && f(s.ema25)) {
    out.push(
      s.ema8 > s.ema25
        ? { code: "ema_cross", label: "EMA 8 acima da EMA 25", direction: "bullish", weight: 2, detail: `EMA8 ${round(s.ema8, 4)} > EMA25 ${round(s.ema25, 4)}` }
        : { code: "ema_cross", label: "EMA 8 abaixo da EMA 25", direction: "bearish", weight: 2, detail: `EMA8 ${round(s.ema8, 4)} < EMA25 ${round(s.ema25, 4)}` },
    );
  }
  if (f(s.ema100)) {
    out.push(
      s.price > s.ema100
        ? { code: "ema100", label: "Preço acima da EMA 100", direction: "bullish", weight: 2, detail: `preço ${round(s.price, 4)} vs EMA100 ${round(s.ema100, 4)}` }
        : { code: "ema100", label: "Preço abaixo da EMA 100", direction: "bearish", weight: 2, detail: `preço ${round(s.price, 4)} vs EMA100 ${round(s.ema100, 4)}` },
    );
  }
  if (f(s.ema200)) {
    out.push(
      s.price > s.ema200
        ? { code: "ema200", label: "Preço acima da EMA 200", direction: "bullish", weight: 1, detail: `EMA200 ${round(s.ema200, 4)}` }
        : { code: "ema200", label: "Preço abaixo da EMA 200", direction: "bearish", weight: 1, detail: `EMA200 ${round(s.ema200, 4)}` },
    );
  }
  if (f(s.rsi14)) {
    if (s.rsi14 >= 70) out.push({ code: "rsi", label: "RSI sobrecomprado", direction: "bearish", weight: 1, detail: `RSI14 ${s.rsi14}` });
    else if (s.rsi14 <= 30) out.push({ code: "rsi", label: "RSI sobrevendido", direction: "bullish", weight: 1, detail: `RSI14 ${s.rsi14}` });
    else if (s.rsi14 > 55) out.push({ code: "rsi", label: "RSI em zona altista", direction: "bullish", weight: 1, detail: `RSI14 ${s.rsi14}` });
    else if (s.rsi14 < 45) out.push({ code: "rsi", label: "RSI em zona baixista", direction: "bearish", weight: 1, detail: `RSI14 ${s.rsi14}` });
  }
  if (f(s.macd.histogram)) {
    out.push(
      s.macd.histogram > 0
        ? { code: "macd", label: "Histograma MACD positivo", direction: "bullish", weight: 2, detail: `hist ${round(s.macd.histogram, 6)}` }
        : { code: "macd", label: "Histograma MACD negativo", direction: "bearish", weight: 2, detail: `hist ${round(s.macd.histogram, 6)}` },
    );
  }
  if (f(s.bollinger.percentB)) {
    if (s.bollinger.percentB > 1) out.push({ code: "bb", label: "Fechamento acima da banda superior", direction: "bearish", weight: 1, detail: `%B ${s.bollinger.percentB}` });
    else if (s.bollinger.percentB < 0) out.push({ code: "bb", label: "Fechamento abaixo da banda inferior", direction: "bullish", weight: 1, detail: `%B ${s.bollinger.percentB}` });
  }
  if (f(s.stochRsi.k) && f(s.stochRsi.d)) {
    if (s.stochRsi.k < 20 && s.stochRsi.k > s.stochRsi.d)
      out.push({ code: "stochrsi", label: "StochRSI cruzando para cima em zona baixa", direction: "bullish", weight: 1, detail: `K ${s.stochRsi.k} D ${s.stochRsi.d}` });
    else if (s.stochRsi.k > 80 && s.stochRsi.k < s.stochRsi.d)
      out.push({ code: "stochrsi", label: "StochRSI cruzando para baixo em zona alta", direction: "bearish", weight: 1, detail: `K ${s.stochRsi.k} D ${s.stochRsi.d}` });
  }
  if (s.breakout === "up") out.push({ code: "breakout", label: "Rompimento de resistência", direction: "bullish", weight: 3, detail: "fechamento acima da resistência mais próxima" });
  if (s.breakout === "down") out.push({ code: "breakout", label: "Rompimento de suporte", direction: "bearish", weight: 3, detail: "fechamento abaixo do suporte mais próximo" });
  if (f(s.relativeVolume) && s.relativeVolume >= 2) {
    out.push({ code: "volume", label: "Volume relativo elevado", direction: "neutral", weight: 1, detail: `${s.relativeVolume}× a média de 20 barras` });
  }
  return out;
}

export function aggregateBias(signals: TaSignal[]): { bias: "bullish" | "bearish" | "neutral"; confidence: number; score: number } {
  let bull = 0;
  let bear = 0;
  for (const s of signals) {
    if (s.direction === "bullish") bull += s.weight;
    else if (s.direction === "bearish") bear += s.weight;
  }
  const total = bull + bear;
  if (total === 0) return { bias: "neutral", confidence: 0, score: 0 };
  const score = (bull - bear) / total; // -1..1
  const confidence = Math.round(Math.abs(score) * 100 * Math.min(1, total / 8));
  const bias = score > 0.2 ? "bullish" : score < -0.2 ? "bearish" : "neutral";
  return { bias, confidence, score: round(score, 3) };
}

export const technicalAnalysisAgent = defineAgent<TaInput, TaOutput>({
  name: "technical-analysis-agent",
  purpose: "Calcular indicadores e padrões de forma determinística e produzir um JSON estruturado de análise técnica.",
  inputs: ["symbol", "timeframe", "candles", "minPatternConfidence"],
  outputs: ["trend", "momentum", "support", "resistance", "signals", "patterns", "indicators", "confidence", "bias", "explanation"],
  allowedTools: ["indicators", "patterns"],
  rules: [
    "Indicadores são calculados por código; nenhum número vem de LLM.",
    "Confiança expressa coerência entre sinais, nunca probabilidade de retorno financeiro.",
    "Padrões abaixo da confiança mínima são descartados.",
  ],
  timeoutMs: 10_000,
  inputSchema: taInputSchema,
  outputSchema: taOutputSchema,

  async run(input, ctx) {
    const indicators = ctx.tools.use<IndicatorTools>("indicators");
    const patternsTool = ctx.tools.use<PatternTools>("patterns");
    const snap = indicators.snapshot(input.candles);
    const patterns = patternsTool.detect(input.candles, input.minPatternConfidence);
    const signals = buildSignals(snap);
    for (const p of patterns.slice(0, 3)) {
      signals.push({ code: `pattern:${p.key}`, label: p.label, direction: p.direction, weight: p.confidence >= 75 ? 3 : 2, detail: p.summary });
    }
    const agg = aggregateBias(signals);
    const bullCount = signals.filter((s) => s.direction === "bullish").length;
    const bearCount = signals.filter((s) => s.direction === "bearish").length;
    const explanation =
      `${input.symbol} ${input.timeframe}: tendência ${pt(snap.trend)} (força ${snap.trendStrength}/100), momentum ${ptMom(snap.momentum)}. ` +
      `${bullCount} sinal(is) de alta e ${bearCount} de baixa (score ${agg.score}). ` +
      `RSI14 ${snap.rsi14}, ATR ${snap.atrPct}% do preço, volume relativo ${snap.relativeVolume}×.` +
      (patterns.length ? ` Padrões: ${patterns.map((p) => `${p.label} (${p.confidence})`).join(", ")}.` : " Nenhum padrão acima da confiança mínima.");
    ctx.log("info", "análise concluída", { bias: agg.bias, confidence: agg.confidence, patterns: patterns.length });
    return {
      asset: input.symbol,
      timeframe: input.timeframe,
      trend: snap.trend,
      momentum: snap.momentum,
      support: snap.supports.map((l) => round(l.price, 8)),
      resistance: snap.resistances.map((l) => round(l.price, 8)),
      signals,
      patterns,
      indicators: snap,
      confidence: agg.confidence,
      bias: agg.bias,
      explanation,
    };
  },
});

export function pt(d: "bullish" | "bearish" | "neutral"): string {
  return d === "bullish" ? "de alta" : d === "bearish" ? "de baixa" : "neutra";
}
export function ptMom(m: string): string {
  return { strong_up: "fortemente positivo", up: "positivo", flat: "neutro", down: "negativo", strong_down: "fortemente negativo" }[m] ?? m;
}
