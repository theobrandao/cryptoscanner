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

/**
 * Bases REST em ordem de preferência. `BINANCE_REST_URL` (api.binance.com) responde 451 em regiões
 * restritas; `data-api.binance.vision` é a base oficial "market data only" da Binance (endpoints de
 * segurança NONE, sem chave) e atende essas regiões. Quando uma base responde 451 ela é evitada por
 * 10 min (memória do processo), para não pagar a ida e volta a cada chamada.
 */
const BLOCK_MS = 10 * 60_000;
const blockedUntil = new Map<string, number>();

export function binanceBases(): string[] {
  const env = getEnv();
  const bases = [env.BINANCE_REST_URL, ...env.BINANCE_REST_FALLBACK_URLS.split(",").map((s) => s.trim()).filter(Boolean)];
  return [...new Set(bases.map((b) => b.replace(/\/$/, "")))];
}

/** Executa `fn` na primeira base disponível; cai para a próxima em 451 (ou erro de rede). */
async function withBase<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const now = Date.now();
  const bases = binanceBases();
  const candidates = bases.filter((b) => (blockedUntil.get(b) ?? 0) < now);
  const order = candidates.length > 0 ? candidates : bases;
  let last: unknown;
  for (const base of order) {
    try {
      return await fn(base);
    } catch (err) {
      last = err;
      const status = err instanceof HttpError ? err.status : 0;
      // 451 (região) ou falha de rede: tenta a próxima base; erros 4xx de parâmetro não são regionais
      if (status === 451 || status === 0 || status >= 500) {
        if (status === 451) blockedUntil.set(base, now + BLOCK_MS);
        continue;
      }
      break;
    }
  }
  wrap(last);
}

/** Usado em testes. */
export function resetBinanceBases(): void {
  blockedUntil.clear();
}

export const binanceProvider: MarketProvider = {
  name: "binance",

  async ping() {
    await withBase((base) => fetchJson(`${base}/api/v3/ping`, { retries: 0, timeoutMs: 4000 }));
  },

  async getCandles(asset, timeframe: Timeframe, limit) {
    const raw = await withBase((base) =>
      fetchJson<Kline[]>(`${base}/api/v3/klines?symbol=${asset.binancePair}&interval=${timeframe}&limit=${Math.min(1000, limit)}`, { retries: 1 }),
    );
    return parseKlines(raw);
  },

  async getTickers(assets) {
    const symbols = JSON.stringify(assets.map((a) => a.binancePair));
    const raw = await withBase((base) => fetchJson<Ticker24h[]>(`${base}/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`, { retries: 1 }));
    const byPair = new Map(raw.map((t) => [t.symbol, t]));
    const out: Ticker[] = [];
    for (const a of assets) {
      const t = byPair.get(a.binancePair);
      if (t) out.push(parseTicker24h(t, a));
    }
    if (out.length === 0) throw new ProviderError("binance", "resposta sem tickers");
    return out;
  },
};

/**
 * Histórico diário longo (paginado, até `days` candles) para simulações/backtests.
 * Aceita qualquer par spot da Binance (ex.: BTCUSDT, USDTBRL). Usa as mesmas bases com fallback regional.
 */
export async function getDailyHistory(pair: string, days: number): Promise<Candle[]> {
  const out: Candle[] = [];
  const dayMs = 24 * 3600_000;
  let start = Date.now() - days * dayMs;
  const end = Date.now();
  while (start < end && out.length < days + 5) {
    const raw = await withBase((base) => fetchJson<Kline[]>(`${base}/api/v3/klines?symbol=${pair}&interval=1d&startTime=${start}&limit=1000`, { retries: 1, timeoutMs: 10_000 }));
    if (raw.length === 0) break;
    out.push(...parseKlines(raw));
    const lastOpen = raw[raw.length - 1]?.[0] ?? end;
    if (raw.length < 1000) break;
    start = lastOpen + dayMs;
  }
  return out.slice(-days);
}
