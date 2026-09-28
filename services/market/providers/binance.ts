import type { AssetDefinition, Candle, Ticker, Timeframe } from "@/types/market";
import { getEnv } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";
import { ProviderError, type MarketProvider } from "@/services/market/providers/types";

/**
 * Binance Spot — API pública (sem chave).
 * klines: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
 * Observação: a Binance responde 451 em regiões não atendidas; o serviço de mercado cai para o próximo provedor.
 */
type Kline = [number, string, string, string, string, string, number, string, number, string, string, string];

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
}

export function parseKlines(raw: Kline[]): Candle[] {
  return raw.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
    quoteVolume: Number(k[7]),
  }));
}

export function parseTicker24h(raw: Ticker24h, asset: AssetDefinition): Ticker {
  return {
    symbol: asset.symbol,
    pair: asset.binancePair,
    price: Number(raw.lastPrice),
    changePct24h: Number(raw.priceChangePercent),
    high24h: Number(raw.highPrice),
    low24h: Number(raw.lowPrice),
    volume24h: Number(raw.volume),
    quoteVolume24h: Number(raw.quoteVolume),
    updatedAt: raw.closeTime || Date.now(),
    source: "binance",
  };
}

function wrap(err: unknown): never {
  if (err instanceof HttpError) {
    const msg = err.status === 451 ? "indisponível nesta região (HTTP 451)" : `HTTP ${err.status}`;
    throw new ProviderError("binance", msg, err.status);
  }
  throw new ProviderError("binance", err instanceof Error ? err.message : String(err));
}

export const binanceProvider: MarketProvider = {
  name: "binance",

  async ping() {
    try {
      await fetchJson(`${getEnv().BINANCE_REST_URL}/api/v3/ping`, { retries: 0, timeoutMs: 4000 });
    } catch (err) {
      wrap(err);
    }
  },

  async getCandles(asset, timeframe: Timeframe, limit) {
    const url = `${getEnv().BINANCE_REST_URL}/api/v3/klines?symbol=${asset.binancePair}&interval=${timeframe}&limit=${Math.min(1000, limit)}`;
    try {
      const raw = await fetchJson<Kline[]>(url, { retries: 1 });
      return parseKlines(raw);
    } catch (err) {
      wrap(err);
    }
  },

  async getTickers(assets) {
    const symbols = JSON.stringify(assets.map((a) => a.binancePair));
    const url = `${getEnv().BINANCE_REST_URL}/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`;
    try {
      const raw = await fetchJson<Ticker24h[]>(url, { retries: 1 });
      const byPair = new Map(raw.map((t) => [t.symbol, t]));
      const out: Ticker[] = [];
      for (const a of assets) {
        const t = byPair.get(a.binancePair);
        if (t) out.push(parseTicker24h(t, a));
      }
      if (out.length === 0) throw new ProviderError("binance", "resposta sem tickers");
      return out;
    } catch (err) {
      wrap(err);
    }
  },
};
