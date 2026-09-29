import type { AssetDefinition, Candle, CandleSeries, MarketSource, ProviderHealth, Ticker, Timeframe } from "@/types/market";
import { ASSETS, getAsset } from "@/lib/assets";
import { cached, getCache } from "@/lib/cache";
import { getMarketProviderOrder } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import { binanceProvider } from "@/services/market/providers/binance";
import { getCoinMarkets, getGlobal, getMarketBubbles, getUsdBrlRate, type CoinMarket, type GlobalData, type MarketBubbleRaw } from "@/services/market/providers/coingecko";
import { krakenProvider } from "@/services/market/providers/kraken";
import { ProviderError, type MarketProvider } from "@/services/market/providers/types";

const log = createLogger("market");

const PROVIDERS: Record<"binance" | "kraken", MarketProvider> = {
  binance: binanceProvider,
  kraken: krakenProvider,
};

/** Estado de indisponibilidade recente por provedor (evita bater em provedor bloqueado a cada chamada). */
const circuit = new Map<string, number>();
const CIRCUIT_MS = 120_000;

/** Permite injetar provedores em testes. */
let providerOverride: MarketProvider[] | null = null;
export function setProvidersForTests(providers: MarketProvider[] | null) {
  providerOverride = providers;
  circuit.clear();
}

function providers(): MarketProvider[] {
  if (providerOverride) return providerOverride;
  return getMarketProviderOrder().map((n) => PROVIDERS[n]);
}

// Chaves de cache
export const CACHE_KEYS = {
  candles: (symbol: string, tf: Timeframe) => `candles:${symbol}:${tf}`,
  tickers: "tickers:all",
  tickersLive: "tickers:live", // alimentado pelo worker via WebSocket
  providerHealth: "providers:health",
  brl: "fx:usdbrl",
  markets: "coingecko:markets",
  global: "coingecko:global",
  bubbles: "coingecko:bubbles",
} as const;

/** TTL de candles em função do timeframe (nunca menos de 20 s nem mais de 5 min). */
function candleTtlSeconds(tf: Timeframe): number {
  return Math.min(300, Math.max(20, Math.floor(TIMEFRAME_MS[tf] / 1000 / 12)));
}

function isOpen(name: string): boolean {
  const until = circuit.get(name);
  return until !== undefined && until > Date.now();
}

async function withFallback<T>(op: string, fn: (p: MarketProvider) => Promise<T>): Promise<{ value: T; source: MarketSource; errors: string[] }> {
  const errors: string[] = [];
  for (const p of providers()) {
    if (isOpen(p.name)) {
      errors.push(`${p.name}: circuito aberto`);
      continue;
    }
    try {
      const value = await fn(p);
      return { value, source: p.name, errors };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      // 451 (geo-bloqueio) ou rede: abre circuito por 2 min.
      if (err instanceof ProviderError && (err.status === 451 || err.status === undefined || err.status >= 500)) {
        circuit.set(p.name, Date.now() + CIRCUIT_MS);
      }
      log.warn(`${op} falhou em ${p.name}`, { error: msg });
    }
  }
  throw new Error(`Todos os provedores falharam para ${op}: ${errors.join(" | ")}`);
}

export interface CandlesOptions {
  limit?: number;
  /** força nova coleta ignorando o cache "fresco" */
  refresh?: boolean;
}

export async function getCandles(symbol: string, timeframe: Timeframe, options: CandlesOptions = {}): Promise<CandleSeries> {
  const asset = getAsset(symbol);
  if (!asset) throw new Error(`Ativo desconhecido: ${symbol}`);
  const limit = options.limit ?? 300;
  const key = CACHE_KEYS.candles(asset.symbol, timeframe);
  if (options.refresh) await getCache().del(key);

  const res = await cached<{ candles: Candle[]; source: MarketSource; fetchedAt: number }>(
    key,
    candleTtlSeconds(timeframe),
    async () => {
      // Busca sempre uma janela ampla (600) e fatia por chamada, para que o cache sirva qualquer `limit` ≤ 600.
      const { value, source } = await withFallback(`candles ${asset.symbol} ${timeframe}`, (p) => p.getCandles(asset, timeframe, 600));
      if (!value.length) throw new Error("série vazia");
      return { candles: value, source, fetchedAt: Date.now() };
    },
    { staleTtlSeconds: 6 * 3600 },
  );

  return {
    symbol: asset.symbol,
    timeframe,
    candles: res.value.candles.slice(-limit),
    source: res.value.source,
    fetchedAt: res.value.fetchedAt,
    stale: res.stale,
  };
}

export interface TickersResult {
  tickers: Ticker[];
  source: MarketSource;
  stale: boolean;
  fetchedAt: number;
}

/**
 * Tickers dos 21 ativos. Prioridade: snapshot ao vivo do worker (WebSocket) → REST com fallback → cache obsoleto.
 */
export async function getTickers(options: { refresh?: boolean } = {}): Promise<TickersResult> {
  const cache = getCache();
  if (!options.refresh) {
    const live = await cache.get<TickersResult>(CACHE_KEYS.tickersLive);
    if (live && Date.now() - live.fetchedAt < 15_000) return { ...live, stale: false };
  } else {
    await cache.del(CACHE_KEYS.tickers);
  }
  const res = await cached<TickersResult>(
    CACHE_KEYS.tickers,
    20,
    async () => {
      const { value, source } = await withFallback("tickers", (p) => p.getTickers(ASSETS));
      return { tickers: value, source, stale: false, fetchedAt: Date.now() };
    },
    { staleTtlSeconds: 6 * 3600 },
  );
  return { ...res.value, stale: res.stale };
}

export async function getTicker(symbol: string): Promise<Ticker | undefined> {
  const { tickers } = await getTickers();
  return tickers.find((t) => t.symbol === symbol.toUpperCase());
}

export async function getUsdBrl(): Promise<{ rate: number; stale: boolean }> {
  try {
    const res = await cached<number>(CACHE_KEYS.brl, 300, getUsdBrlRate, { staleTtlSeconds: 24 * 3600 });
    return { rate: res.value, stale: res.stale };
  } catch (err) {
    log.warn("câmbio BRL indisponível", { error: (err as Error).message });
    return { rate: NaN, stale: true };
  }
}

export async function getMarketCaps(): Promise<{ markets: CoinMarket[]; stale: boolean } | null> {
  try {
    const res = await cached<CoinMarket[]>(CACHE_KEYS.markets, 120, () => getCoinMarkets(ASSETS), { staleTtlSeconds: 24 * 3600 });
    return { markets: res.value, stale: res.stale };
  } catch (err) {
    log.warn("coingecko markets indisponível", { error: (err as Error).message });
    return null;
  }
}

export async function getGlobalMarket(): Promise<{ data: GlobalData; stale: boolean } | null> {
  try {
    const res = await cached<GlobalData>(CACHE_KEYS.global, 300, getGlobal, { staleTtlSeconds: 24 * 3600 });
    return { data: res.value, stale: res.stale };
  } catch (err) {
    log.warn("coingecko global indisponível", { error: (err as Error).message });
    return null;
  }
}

export interface MarketBubble {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  marketCap: number;
  rank: number | null;
  volume24h: number;
  change: { "1h": number | null; "24h": number | null; "7d": number | null; "30d": number | null };
}

/** Top 100 por volume com variação 1h/24h/7d/30d (CoinGecko; cache 60 s; stale até 24 h). */
export async function getBubbles(limit = 100): Promise<{ bubbles: MarketBubble[]; stale: boolean; fetchedAt: number } | null> {
  try {
    // sempre busca/cacheia 100 e fatia por `limit` (uma única entrada de cache para todos os limites)
    const res = await cached<{ items: MarketBubbleRaw[]; at: number }>(CACHE_KEYS.bubbles, 60, async () => ({ items: await getMarketBubbles(100), at: Date.now() }), { staleTtlSeconds: 24 * 3600 });
    const bubbles = res.value.items.slice(0, limit).map<MarketBubble>((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      price: c.current_price,
      marketCap: c.market_cap,
      rank: c.market_cap_rank,
      volume24h: c.total_volume,
      change: {
        "1h": c.price_change_percentage_1h_in_currency ?? null,
        "24h": c.price_change_percentage_24h_in_currency ?? null,
        "7d": c.price_change_percentage_7d_in_currency ?? null,
        "30d": c.price_change_percentage_30d_in_currency ?? null,
      },
    }));
    return { bubbles, stale: res.stale, fetchedAt: res.value.at };
  } catch (err) {
    log.warn("coingecko bubbles indisponível", { error: (err as Error).message });
    return null;
  }
}

/** Verifica os provedores (com cache de 60 s) para o indicador de status da interface. */
export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const res = await cached<ProviderHealth[]>(CACHE_KEYS.providerHealth, 60, async () => {
    const list = providers();
    return Promise.all(
      list.map(async (p): Promise<ProviderHealth> => {
        const t0 = Date.now();
        try {
          await p.ping();
          return { provider: p.name, ok: true, latencyMs: Date.now() - t0, checkedAt: Date.now() };
        } catch (err) {
          return { provider: p.name, ok: false, error: (err as Error).message, checkedAt: Date.now() };
        }
      }),
    );
  });
  return res.value;
}

export function listAssets(): readonly AssetDefinition[] {
  return ASSETS;
}
