import type { Candle, Ticker, Timeframe } from "@/types/market";
import { getEnv } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";
import { KRAKEN_INTERVAL, TIMEFRAME_MS } from "@/lib/timeframes";
import { createLimiter, ProviderError, type MarketProvider } from "@/services/market/providers/types";

/**
 * Kraken — API pública (sem chave), sem bloqueio regional.
 * OHLC: [time(s), open, high, low, close, vwap, volume, count] — até 720 candles, o último em formação.
 * Ticker: a/b/c/v/p/t/l/h/o — não traz variação 24h; calculamos a partir dos candles de 1h.
 */
type KrakenOhlcRow = [number, string, string, string, string, string, string, number];

interface KrakenResponse<T> {
  error: string[];
  result: T;
}

interface KrakenTickerEntry {
  c: [string, string];
  v: [string, string];
  h: [string, string];
  l: [string, string];
  o: string;
  p: [string, string];
}

// Endpoints públicos da Kraken toleram ~1 chamada/segundo por IP; espaçamos as chamadas.
const limiter = createLimiter(3, 120);

async function krakenGet<T>(path: string): Promise<T> {
  const url = `${getEnv().KRAKEN_REST_URL}${path}`;
  let res: KrakenResponse<T>;
  try {
    res = await limiter(() => fetchJson<KrakenResponse<T>>(url, { retries: 1 }));
  } catch (err) {
    if (err instanceof HttpError) throw new ProviderError("kraken", `HTTP ${err.status}`, err.status);
    throw new ProviderError("kraken", err instanceof Error ? err.message : String(err));
  }
  if (res.error && res.error.length) throw new ProviderError("kraken", res.error.join("; "));
  return res.result;
}

export function parseOhlc(rows: KrakenOhlcRow[], timeframe: Timeframe): Candle[] {
  const span = TIMEFRAME_MS[timeframe];
  return rows.map((r) => {
    const openTime = r[0] * 1000;
    const open = Number(r[1]);
    const close = Number(r[4]);
    const volume = Number(r[6]);
    return {
      openTime,
      closeTime: openTime + span - 1,
      open,
      high: Number(r[2]),
      low: Number(r[3]),
      close,
      volume,
      quoteVolume: Number(r[5]) * volume, // vwap × volume
    };
  });
}

function firstResultKey<T extends Record<string, unknown>>(result: T): string | undefined {
  return Object.keys(result).find((k) => k !== "last");
}

export const krakenProvider: MarketProvider = {
  name: "kraken",

  async ping() {
    await krakenGet<{ unixtime: number }>("/0/public/Time");
  },

  async getCandles(asset, timeframe, limit) {
    const interval = KRAKEN_INTERVAL[timeframe];
    const result = await krakenGet<Record<string, KrakenOhlcRow[] | number>>(`/0/public/OHLC?pair=${asset.krakenPair}&interval=${interval}`);
    const key = firstResultKey(result);
    const rows = key ? result[key] : undefined;
    if (!Array.isArray(rows)) throw new ProviderError("kraken", `sem OHLC para ${asset.krakenPair}`);
    const candles = parseOhlc(rows as KrakenOhlcRow[], timeframe);
    return candles.slice(-limit);
  },

  async getTickers(assets) {
    const pairs = assets.map((a) => a.krakenPair).join(",");
    const result = await krakenGet<Record<string, KrakenTickerEntry>>(`/0/public/Ticker?pair=${pairs}`);
    // As chaves de retorno diferem do altname (XBTUSD → XXBTZUSD); mapeamos pela ordem/normalização.
    const normalized = new Map<string, KrakenTickerEntry>();
    for (const [k, v] of Object.entries(result)) normalized.set(normalizeKrakenKey(k), v);

    // Variação 24h: fechamento atual vs. fechamento de 24 candles de 1h atrás.
    const changes = await Promise.all(
      assets.map(async (a) => {
        try {
          const candles = await krakenProvider.getCandles(a, "1h", 26);
          const lastC = candles[candles.length - 1];
          const ref = candles[candles.length - 25];
          if (!lastC || !ref || ref.close === 0) return NaN;
          return ((lastC.close - ref.close) / ref.close) * 100;
        } catch {
          return NaN;
        }
      }),
    );

    const out: Ticker[] = [];
    assets.forEach((a, i) => {
      const t = normalized.get(normalizeKrakenKey(a.krakenPair));
      if (!t) return;
      const price = Number(t.c[0]);
      const change = changes[i] ?? NaN;
      const open = Number(t.o);
      out.push({
        symbol: a.symbol,
        pair: a.binancePair,
        price,
        changePct24h: Number.isFinite(change) ? change : open > 0 ? ((price - open) / open) * 100 : 0,
        high24h: Number(t.h[1]),
        low24h: Number(t.l[1]),
        volume24h: Number(t.v[1]),
        quoteVolume24h: Number(t.v[1]) * Number(t.p[1]),
        updatedAt: Date.now(),
        source: "kraken",
      });
    });
    if (out.length === 0) throw new ProviderError("kraken", "resposta sem tickers");
    return out;
  },
};

/** XXBTZUSD → XBTUSD, XETHZUSD → ETHUSD, XDGUSD → XDGUSD, SOLUSD → SOLUSD */
export function normalizeKrakenKey(key: string): string {
  let k = key.toUpperCase();
  if (k.length === 8 && k.startsWith("X") && k.includes("Z")) {
    // formato legado X<base>Z<quote>
    k = k.slice(1).replace("Z", "");
  }
  return k;
}
