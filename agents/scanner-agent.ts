import { z } from "zod";
import { defineAgent } from "@/agents/runtime";
import { directionSchema, patternMatchSchema, symbolSchema, timeframeSchema, volumeAnomalySchema } from "@/agents/schemas";
import type { IndicatorTools, MarketTools, PatternTools, VolumeTools } from "@/agents/tools";
import { aggregateBias, buildSignals } from "@/agents/technical-analysis-agent";
import { ASSET_SYMBOLS } from "@/lib/assets";
import { round } from "@/lib/indicators/core";
import { createLimiter } from "@/services/market/providers/types";
import type { Timeframe } from "@/types/market";

/**
 * SCANNER AGENT
 * Analisa vários ativos simultaneamente: preço, variação, volume, volume relativo, volatilidade,
 * tendência, EMAs, RSI, MACD, Bollinger, ATR, S/R, rompimentos, momentum, padrões e volume anômalo.
 */
export const scannerInputSchema = z.object({
  symbols: z
    .array(symbolSchema)
    .min(1)
    .max(50)
    .default([...ASSET_SYMBOLS]),
  timeframe: timeframeSchema.default("4h"),
  includePatterns: z.boolean().default(true),
  minPatternConfidence: z.number().min(0).max(100).default(60),
  patternDirection: z.enum(["all", "bullish", "bearish"]).default("all"),
  includeVolume: z.boolean().default(false),
  volumeTimeframes: z.array(timeframeSchema).default(["30m", "1h"]),
  concurrency: z.number().int().min(1).max(10).default(4),
});

export const scannerRowSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  changePct24h: z.number().nullable(),
  volume24h: z.number().nullable(),
  quoteVolume24h: z.number().nullable(),
  relativeVolume: z.number().or(z.nan()),
  volatilityPct: z.number().or(z.nan()),
  atrPct: z.number().or(z.nan()),
  trend: directionSchema,
  trendStrength: z.number(),
  ema: z.object({ e8: z.number().or(z.nan()), e25: z.number().or(z.nan()), e100: z.number().or(z.nan()), e200: z.number().or(z.nan()) }),
  rsi14: z.number().or(z.nan()),
  macdHistogram: z.number().or(z.nan()),
  bollingerPercentB: z.number().or(z.nan()),
  stochRsiK: z.number().or(z.nan()),
  momentum: z.enum(["strong_up", "up", "flat", "down", "strong_down"]),
  support: z.number().nullable(),
  resistance: z.number().nullable(),
  breakout: z.enum(["up", "down"]).nullable(),
  signal: directionSchema,
  signalScore: z.number(),
  signalConfidence: z.number(),
  patterns: z.array(patternMatchSchema),
  source: z.string(),
  stale: z.boolean(),
  candleTime: z.number(),
});

export const scannerOutputSchema = z.object({
  timeframe: timeframeSchema,
  scannedAt: z.number(),
  rows: z.array(scannerRowSchema),
  volumeAlerts: z.array(volumeAnomalySchema),
  errors: z.array(z.object({ symbol: z.string(), error: z.string() })),
  sources: z.array(z.string()),
  staleCount: z.number(),
  assetsAnalyzed: z.number(),
});

export type ScannerInput = z.infer<typeof scannerInputSchema>;
export type ScannerOutput = z.infer<typeof scannerOutputSchema>;
export type ScannerRow = z.infer<typeof scannerRowSchema>;

export const scannerAgent = defineAgent<ScannerInput, ScannerOutput>({
  name: "scanner-agent",
  purpose: "Varrer o universo de ativos calculando métricas técnicas, padrões e volume anômalo em paralelo controlado.",
  inputs: ["symbols", "timeframe", "includePatterns", "minPatternConfidence", "patternDirection", "includeVolume", "volumeTimeframes", "concurrency"],
  outputs: ["rows", "volumeAlerts", "errors", "sources", "staleCount", "assetsAnalyzed"],
  allowedTools: ["market", "indicators", "patterns", "volume"],
  rules: [
    "Falha em um ativo não interrompe o scan; é registrada em `errors`.",
    "Concorrência limitada para respeitar os limites dos provedores públicos.",
    "Padrões só entram acima da confiança mínima e no filtro de direção pedido.",
  ],
  timeoutMs: 90_000,
  inputSchema: scannerInputSchema,
  outputSchema: scannerOutputSchema,

  async run(input, ctx) {
    const market = ctx.tools.use<MarketTools>("market");
    const indicators = ctx.tools.use<IndicatorTools>("indicators");
    const patternsTool = ctx.tools.use<PatternTools>("patterns");
    const volumeTool = ctx.tools.use<VolumeTools>("volume");
    const limiter = createLimiter(input.concurrency, 0);

    let tickers = new Map<string, { changePct24h: number; volume24h: number; quoteVolume24h: number }>();
    try {
      const t = await market.getTickers();
      tickers = new Map(t.tickers.map((k) => [k.symbol, k]));
    } catch (err) {
      ctx.log("warn", "tickers indisponíveis; colunas 24h ficarão vazias", { error: (err as Error).message });
    }

    const rows: ScannerRow[] = [];
    const volumeAlerts: ScannerOutput["volumeAlerts"] = [];
    const errors: ScannerOutput["errors"] = [];
    const sources = new Set<string>();
    let staleCount = 0;

    await Promise.all(
      input.symbols.map((symbol) =>
        limiter(async () => {
          if (ctx.signal.aborted) return;
          try {
            const series = await market.getCandles(symbol, input.timeframe, 300);
            sources.add(series.source);
            if (series.stale) staleCount++;
            const snap = indicators.snapshot(series.candles);
            let patterns = input.includePatterns ? patternsTool.detect(series.candles, input.minPatternConfidence) : [];
            if (input.patternDirection !== "all") patterns = patterns.filter((p) => p.direction === input.patternDirection);
            patterns = patterns.slice(0, 3);
            const signals = buildSignals(snap);
            for (const p of patterns) signals.push({ code: `pattern:${p.key}`, label: p.label, direction: p.direction, weight: p.confidence >= 75 ? 3 : 2, detail: p.summary });
            const agg = aggregateBias(signals);
            const t = tickers.get(symbol);
            const lastCandle = series.candles[series.candles.length - 1];
            rows.push({
              symbol,
              price: snap.price,
              changePct24h: t ? round(t.changePct24h, 2) : null,
              volume24h: t ? t.volume24h : null,
              quoteVolume24h: t ? t.quoteVolume24h : null,
              relativeVolume: snap.relativeVolume,
              volatilityPct: snap.volatilityPct,
              atrPct: snap.atrPct,
              trend: snap.trend,
              trendStrength: snap.trendStrength,
              ema: { e8: snap.ema8, e25: snap.ema25, e100: snap.ema100, e200: snap.ema200 },
              rsi14: snap.rsi14,
              macdHistogram: snap.macd.histogram,
              bollingerPercentB: snap.bollinger.percentB,
              stochRsiK: snap.stochRsi.k,
              momentum: snap.momentum,
              support: snap.supports[0]?.price ?? null,
              resistance: snap.resistances[0]?.price ?? null,
              breakout: snap.breakout,
              signal: agg.bias,
              signalScore: agg.score,
              signalConfidence: agg.confidence,
              patterns,
              source: series.source,
              stale: series.stale,
              candleTime: lastCandle?.openTime ?? 0,
            });
            if (input.includeVolume) {
              for (const vtf of input.volumeTimeframes as Timeframe[]) {
                try {
                  const vs = await market.getCandles(symbol, vtf, 60);
                  const anomaly = volumeTool.detect(symbol, vtf, vs.candles);
                  if (anomaly) volumeAlerts.push(anomaly);
                } catch (err) {
                  ctx.log("warn", "volume indisponível", { symbol, vtf, error: (err as Error).message });
                }
              }
            }
          } catch (err) {
            errors.push({ symbol, error: (err as Error).message });
            ctx.log("warn", "ativo falhou", { symbol, error: (err as Error).message });
          }
        }),
      ),
    );

    rows.sort((a, b) => (b.quoteVolume24h ?? 0) - (a.quoteVolume24h ?? 0) || a.symbol.localeCompare(b.symbol));
    volumeAlerts.sort((a, b) => b.increasePct - a.increasePct);
    ctx.log("info", "scan concluído", { rows: rows.length, errors: errors.length, volumeAlerts: volumeAlerts.length, sources: [...sources] });
    return {
      timeframe: input.timeframe,
      scannedAt: ctx.now,
      rows,
      volumeAlerts,
      errors,
      sources: [...sources],
      staleCount,
      assetsAnalyzed: rows.length,
    };
  },
});
