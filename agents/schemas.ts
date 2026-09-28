import { z } from "zod";
import { TIMEFRAMES } from "@/types/market";
import { ASSET_SYMBOLS } from "@/lib/assets";
import { PATTERN_KEYS } from "@/lib/patterns/catalog";

/** Schemas zod compartilhados pelos agentes (entrada/saída). */

export const symbolSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .refine((s) => ASSET_SYMBOLS.includes(s), { message: "ativo fora do universo monitorado" });

export const timeframeSchema = z.enum(TIMEFRAMES);
export const directionSchema = z.enum(["bullish", "bearish", "neutral"]);

export const candleSchema = z.object({
  openTime: z.number(),
  closeTime: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  quoteVolume: z.number().optional(),
});

export const tickerSchema = z.object({
  symbol: z.string(),
  pair: z.string(),
  price: z.number(),
  changePct24h: z.number(),
  high24h: z.number(),
  low24h: z.number(),
  volume24h: z.number(),
  quoteVolume24h: z.number(),
  updatedAt: z.number(),
  source: z.enum(["binance", "kraken", "coingecko", "cache"]),
});

const nanNumber = z.number().or(z.nan());

export const levelSchema = z.object({
  price: z.number(),
  kind: z.enum(["support", "resistance"]),
  touches: z.number(),
  strength: z.number(),
  lastTouchIndex: z.number(),
});

export const snapshotSchema = z.object({
  price: z.number(),
  ema8: nanNumber,
  ema25: nanNumber,
  ema100: nanNumber,
  ema200: nanNumber,
  sma20: nanNumber,
  sma50: nanNumber,
  rsi14: nanNumber,
  macd: z.object({ line: nanNumber, signal: nanNumber, histogram: nanNumber }),
  bollinger: z.object({ upper: nanNumber, middle: nanNumber, lower: nanNumber, bandwidth: nanNumber, percentB: nanNumber }),
  atr14: nanNumber,
  atrPct: nanNumber,
  stochRsi: z.object({ k: nanNumber, d: nanNumber }),
  roc10: nanNumber,
  volatilityPct: nanNumber,
  relativeVolume: nanNumber,
  slopePct: nanNumber,
  trend: directionSchema,
  trendStrength: z.number(),
  momentum: z.enum(["strong_up", "up", "flat", "down", "strong_down"]),
  supports: z.array(levelSchema),
  resistances: z.array(levelSchema),
  breakout: z.enum(["up", "down"]).nullable(),
  candlesUsed: z.number(),
});

export const patternMatchSchema = z.object({
  key: z.enum(PATTERN_KEYS),
  label: z.string(),
  direction: directionSchema,
  confidence: z.number().min(0).max(100),
  price: z.number(),
  target: z.number().nullable(),
  stop: z.number().nullable(),
  points: z.array(z.object({ index: z.number(), price: z.number(), time: z.number(), role: z.string() })),
  levels: z.array(z.object({ price: z.number(), role: z.string() })),
  summary: z.string(),
  /** Ajuste de contexto aplicado pelo scanner (ex.: altcoin contra a tendência do BTC). */
  context: z
    .object({
      btcTrend: directionSchema,
      adjustment: z.number(),
      note: z.string(),
    })
    .optional(),
});

export const volumeAnomalySchema = z.object({
  symbol: z.string(),
  timeframe: timeframeSchema,
  volume: z.number(),
  averageVolume: z.number(),
  increasePct: z.number(),
  priceChangePct: z.number(),
  direction: z.enum(["up", "down", "flat"]),
  candleOpenTime: z.number(),
  isCurrentCandle: z.boolean(),
});

/** Anotação obrigatória de origem/data em qualquer dado externo. */
export const provenanceSchema = z.object({
  source: z.string(),
  asOf: z.number(),
  stale: z.boolean(),
});
