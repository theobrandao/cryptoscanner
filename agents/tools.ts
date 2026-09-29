import type { ZodType } from "zod";
import type { Candle, CandleSeries, Ticker, Timeframe } from "@/types/market";
import { computeSnapshot, type IndicatorSnapshot } from "@/lib/indicators/snapshot";
import { detectPatterns, type PatternMatch } from "@/lib/patterns/detect";
import { detectVolumeAnomaly, type VolumeAnomaly } from "@/lib/scanner/volume";
import { getCandles, getTicker, getTickers, type TickersResult } from "@/services/market/market-service";
import { getFearGreed, type FearGreed } from "@/services/sentiment/fear-greed";
import { filterNewsForSymbol, getNews, type NewsItem } from "@/services/sentiment/news";
import { completeJson, getLlmInfo, type LlmInfo, type LlmJsonRequest } from "@/services/llm";
import type { ToolMap } from "@/agents/runtime";

/**
 * Ferramentas que os agentes podem usar. Cada agente declara quais precisa; o runtime
 * bloqueia qualquer outra. Os nomes são estáveis e aparecem nos logs.
 */
export interface MarketTools {
  getCandles(symbol: string, timeframe: Timeframe, limit?: number, includeForming?: boolean): Promise<CandleSeries>;
  getTicker(symbol: string): Promise<Ticker | undefined>;
  getTickers(): Promise<TickersResult>;
}
export interface IndicatorTools {
  snapshot(candles: readonly Candle[]): IndicatorSnapshot;
}
export interface PatternTools {
  detect(candles: readonly Candle[], minConfidence?: number): PatternMatch[];
}
export interface VolumeTools {
  detect(symbol: string, timeframe: Timeframe, candles: readonly Candle[]): VolumeAnomaly | null;
}
export interface SentimentTools {
  fearGreed(): Promise<{ data: FearGreed; stale: boolean }>;
  news(symbol: string): Promise<{ items: NewsItem[]; stale: boolean; fetchedAt: number }>;
}
export interface LlmTools {
  info(): LlmInfo;
  completeJson<T>(req: LlmJsonRequest<T>): Promise<T | null>;
}

export const TOOL_NAMES = {
  market: "market",
  indicators: "indicators",
  patterns: "patterns",
  volume: "volume",
  sentiment: "sentiment",
  llm: "llm",
} as const;

export function createDefaultTools(overrides: Partial<ToolMap> = {}): ToolMap {
  const market: MarketTools = {
    getCandles: (symbol, timeframe, limit, includeForming) => getCandles(symbol, timeframe, { limit, includeForming }),
    getTicker,
    getTickers,
  };
  const indicators: IndicatorTools = { snapshot: computeSnapshot };
  const patterns: PatternTools = { detect: (c, min) => detectPatterns(c, { minConfidence: min }) };
  const volume: VolumeTools = { detect: detectVolumeAnomaly };
  const sentiment: SentimentTools = {
    fearGreed: getFearGreed,
    news: async (symbol) => {
      const res = await getNews();
      return { ...res, items: filterNewsForSymbol(res.items, symbol) };
    },
  };
  const llm: LlmTools = {
    info: getLlmInfo,
    completeJson: <T>(req: LlmJsonRequest<T>) => completeJson<T>(req),
  };
  return { market, indicators, patterns, volume, sentiment, llm, ...overrides };
}

export type SchemaOf<T> = ZodType<T>;
