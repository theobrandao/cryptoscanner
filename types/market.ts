/**
 * Tipos de domínio compartilhados entre serviços, agentes, API e interface.
 * Nenhum tipo aqui depende de Prisma, Next.js ou provedores externos.
 */

export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const SCANNER_TIMEFRAMES = ["15m", "30m", "1h", "4h", "1d", "1w"] as const;
export type ScannerTimeframe = (typeof SCANNER_TIMEFRAMES)[number];

export type MarketSource = "binance" | "kraken" | "coingecko" | "cache";

export interface Candle {
  /** epoch ms de abertura */
  openTime: number;
  /** epoch ms de fechamento */
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** volume em moeda base */
  volume: number;
  /** volume em moeda de cotação (quando o provedor fornece) */
  quoteVolume?: number;
}

export interface Ticker {
  symbol: string; // BTC
  pair: string; // BTCUSDT
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  updatedAt: number; // epoch ms
  source: MarketSource;
}

export interface AssetDefinition {
  symbol: string;
  name: string;
  binancePair: string;
  krakenPair: string;
  coingeckoId: string;
  /** glifo textual próprio (não é logo de terceiros) */
  glyph: string;
  sortOrder: number;
}

export type Direction = "bullish" | "bearish" | "neutral";

export interface CandleSeries {
  symbol: string;
  timeframe: Timeframe;
  /** candles FECHADOS (padrão) ou fechados + em formação quando pedido com includeForming */
  candles: Candle[];
  /** candle em formação (null se o último já fechou) — nunca usado para sinal */
  forming?: Candle | null;
  source: MarketSource;
  fetchedAt: number;
  /** true quando os dados vieram de cache por indisponibilidade dos provedores */
  stale: boolean;
  /** diagnóstico do Data Quality Engine */
  quality?: import("@/lib/engines/quality").DataQuality;
}

export interface ProviderHealth {
  provider: MarketSource;
  ok: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: number;
}
