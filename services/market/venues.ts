import type { AssetDefinition, Candle, Timeframe } from "@/types/market";
import { getEnv } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";
import { cached } from "@/lib/cache";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import { classifyStatus, validateCandles, type DataQuality } from "@/lib/engines/quality";
import { binanceProvider } from "@/services/market/providers/binance";
import { getDerivativesSnapshot, type DerivativesSnapshot } from "@/services/market/providers/binance-futures";
import { getOkxDerivativesSnapshot } from "@/services/market/providers/okx-derivatives";
import { ProviderError } from "@/services/market/providers/types";
import { getCandles, getTicker } from "@/services/market/market-service";

/**
 * Camada de venues do contexto global: exchange (Binance, Bybit, OKX) × instrumento (spot, perpétuo USDT).
 * Todos os endpoints são públicos (sem chave). Cada resposta sai com a fonte REAL que a produziu:
 * se a exchange escolhida falhar, o contexto usa a próxima e marca FALLBACK com o nome da fonte usada.
 *
 * Docs: Binance Spot /api/v3 e USDⓈ-M /fapi/v1; Bybit v5 /v5/market (category spot|linear); OKX v5 /api/v5/market.
 */
import { VENUES, VENUE_LABEL, INSTRUMENT_LABEL, type Instrument, type Venue } from "@/lib/venues";
export { VENUES, INSTRUMENTS, VENUE_LABEL, INSTRUMENT_LABEL, isVenue, isInstrument, type Venue, type Instrument } from "@/lib/venues";

export interface VenueTicker {
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  updatedAt: number;
  source: string;
}

export interface VenueSeries {
  /** fechados + em formação (quando houver) */
  candles: Candle[];
  closed: Candle[];
  forming: Candle | null;
  venue: Venue;
  instrument: Instrument;
  quality: DataQuality;
}

export type VenueDerivatives = DerivativesSnapshot & { exchange: Venue };

const BYBIT = "https://api.bybit.com";
const OKX = "https://www.okx.com/api/v5";
const OPTS = { retries: 1, timeoutMs: 7000 };

function venueError(venue: Venue, err: unknown): never {
  if (err instanceof ProviderError) throw err;
  if (err instanceof HttpError) throw new ProviderError(venue, err.status === 451 || err.status === 403 ? `indisponível nesta região (HTTP ${err.status})` : `HTTP ${err.status}`, err.status);
  throw new ProviderError(venue, err instanceof Error ? err.message : String(err));
}

/* ------------------------------------------------------------------ candles */

const BYBIT_INTERVAL: Record<Timeframe, string> = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D", "1w": "W" };
const OKX_BAR: Record<Timeframe, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1Dutc", "1w": "1Wutc" };

type BinanceKline = [number, string, string, string, string, string, number, string];

async function binancePerpCandles(asset: AssetDefinition, tf: Timeframe, limit: number): Promise<Candle[]> {
  const base = getEnv().BINANCE_FUTURES_REST_URL.replace(/\/$/, "");
  const raw = await fetchJson<BinanceKline[]>(`${base}/fapi/v1/klines?symbol=${asset.binancePair}&interval=${tf}&limit=${Math.min(1500, limit)}`, OPTS);
  return raw.map((k) => ({ openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: k[6], quoteVolume: +k[7] }));
}

type BybitResp<T> = { retCode: number; retMsg: string; result: T; time?: number };
async function bybit<T>(path: string): Promise<{ result: T; time: number }> {
  const r = await fetchJson<BybitResp<T>>(`${BYBIT}${path}`, OPTS);
  if (r.retCode !== 0) throw new ProviderError("bybit", `retCode ${r.retCode} ${r.retMsg}`);
  return { result: r.result, time: r.time ?? Date.now() };
}

async function bybitCandles(asset: AssetDefinition, inst: Instrument, tf: Timeframe, limit: number): Promise<Candle[]> {
  const { result } = await bybit<{ list: string[][] }>(`/v5/market/kline?category=${inst === "spot" ? "spot" : "linear"}&symbol=${asset.binancePair}&interval=${BYBIT_INTERVAL[tf]}&limit=${Math.min(1000, limit)}`);
  const span = TIMEFRAME_MS[tf];
  // [startTime, open, high, low, close, volume, turnover] — mais recente primeiro
  return result.list.map((k) => ({ openTime: +k[0]!, open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]!, quoteVolume: +k[6]!, closeTime: +k[0]! + span - 1 })).reverse();
}

type OkxResp<T> = { code: string; msg: string; data: T };
async function okx<T>(path: string): Promise<T> {
  const r = await fetchJson<OkxResp<T>>(`${OKX}${path}`, OPTS);
  if (r.code !== "0") throw new ProviderError("okx", `code ${r.code} ${r.msg}`);
  return r.data;
}
const okxInst = (asset: AssetDefinition, inst: Instrument) => `${asset.symbol}-USDT${inst === "perp" ? "-SWAP" : ""}`;

async function okxCandles(asset: AssetDefinition, inst: Instrument, tf: Timeframe, limit: number): Promise<Candle[]> {
  const instId = okxInst(asset, inst);
  const span = TIMEFRAME_MS[tf];
  // [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] — mais recente primeiro; /candles devolve até 300
  const rows = await okx<string[][]>(`/market/candles?instId=${instId}&bar=${OKX_BAR[tf]}&limit=300`);
  let all = rows;
  while (all.length < limit) {
    const oldest = all[all.length - 1]?.[0];
    if (!oldest) break;
    const more = await okx<string[][]>(`/market/history-candles?instId=${instId}&bar=${OKX_BAR[tf]}&after=${oldest}&limit=100`);
    if (!more.length) break;
    all = [...all, ...more];
  }
  return all
    .map((k) => ({
      openTime: +k[0]!,
      open: +k[1]!,
      high: +k[2]!,
      low: +k[3]!,
      close: +k[4]!,
      // SWAP: vol em contratos; volCcy em moeda base
      volume: inst === "perp" ? +k[6]! : +k[5]!,
      quoteVolume: +k[7]!,
      closeTime: +k[0]! + span - 1,
    }))
    .reverse();
}

async function rawCandles(venue: Venue, inst: Instrument, asset: AssetDefinition, tf: Timeframe, limit: number): Promise<Candle[]> {
  try {
    if (venue === "binance") return inst === "spot" ? await binanceProvider.getCandles(asset, tf, limit) : await binancePerpCandles(asset, tf, limit);
    if (venue === "bybit") return await bybitCandles(asset, inst, tf, limit);
    return await okxCandles(asset, inst, tf, limit);
  } catch (err) {
    venueError(venue, err);
  }
}

const candleTtl = (tf: Timeframe) => Math.min(300, Math.max(20, Math.floor(TIMEFRAME_MS[tf] / 1000 / 12)));

/** Série validada de UMA venue (sem trocar de exchange). Binance spot reaproveita o serviço de mercado (WS + cache). */
export async function getVenueSeries(venue: Venue, inst: Instrument, asset: AssetDefinition, tf: Timeframe, limit = 400): Promise<VenueSeries> {
  if (venue === "binance" && inst === "spot") {
    const s = await getCandles(asset.symbol, tf, { limit, includeForming: true });
    const forming = s.forming ?? null;
    const closed = forming ? s.candles.slice(0, -1) : s.candles;
    return { candles: s.candles, closed, forming, venue, instrument: inst, quality: s.quality as DataQuality };
  }
  const want = limit;
  const res = await cached<{ candles: Candle[]; fetchedAt: number }>(
    `vcandles:v1:${venue}:${inst}:${asset.symbol}:${tf}:${want}`,
    candleTtl(tf),
    async () => ({ candles: await rawCandles(venue, inst, asset, tf, want), fetchedAt: Date.now() }),
    { staleTtlSeconds: Math.min(3 * 86_400, Math.max(1800, Math.round((3 * TIMEFRAME_MS[tf]) / 1000))) },
  );
  const v = validateCandles(res.value.candles, tf);
  const lastClosed = v.closed[v.closed.length - 1];
  const source = `${venue}-${inst}`;
  const cls = classifyStatus({ source, primarySource: source, fetchedAt: res.value.fetchedAt, stale: res.stale, timeframe: tf, lastClosedOpenTime: lastClosed?.openTime ?? null, gaps: v.gaps, invalid: v.invalid });
  const closed = v.closed.slice(-limit);
  return {
    candles: v.forming ? [...closed, v.forming] : closed,
    closed,
    forming: v.forming,
    venue,
    instrument: inst,
    quality: {
      status: cls.status,
      source,
      fetchedAt: res.value.fetchedAt,
      ageMs: Date.now() - res.value.fetchedAt,
      lastClosedOpenTime: lastClosed?.openTime ?? null,
      gaps: v.gaps,
      invalid: v.invalid,
      duplicates: v.duplicates,
      outliers: v.outliers,
      issues: [...v.issues, ...cls.issues],
    },
  };
}

/** Ordem de fallback quando a venue escolhida falha: as demais, na ordem fixa Binance → OKX → Bybit. */
export function fallbackOrder(venue: Venue): Venue[] {
  return [venue, ...(["binance", "okx", "bybit"] as Venue[]).filter((v) => v !== venue)];
}

/** Série da venue escolhida; se falhar, próxima venue do mesmo instrumento com status FALLBACK e fonte identificada. */
export async function getSeriesWithFallback(venue: Venue, inst: Instrument, asset: AssetDefinition, tf: Timeframe, limit = 400): Promise<VenueSeries & { errors: string[] }> {
  const errors: string[] = [];
  for (const v of fallbackOrder(venue)) {
    try {
      const s = await getVenueSeries(v, inst, asset, tf, limit);
      if (!s.closed.length) throw new ProviderError(v, "série vazia");
      if (v !== venue) {
        s.quality = { ...s.quality, status: s.quality.status === "LIVE" ? "FALLBACK" : s.quality.status, issues: [`${VENUE_LABEL[venue]} indisponível; dados de ${VENUE_LABEL[v]} ${INSTRUMENT_LABEL[inst]}`, ...s.quality.issues] };
      }
      return { ...s, errors };
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  throw new ProviderError(venue, `nenhuma exchange respondeu (${errors.join(" · ")})`);
}

/* ------------------------------------------------------------------ ticker */

async function rawTicker(venue: Venue, inst: Instrument, asset: AssetDefinition): Promise<VenueTicker> {
  try {
    if (venue === "binance") {
      if (inst === "spot") {
        const t = await getTicker(asset.symbol);
        if (!t) throw new ProviderError("binance", "ticker indisponível");
        return { price: t.price, changePct24h: t.changePct24h, high24h: t.high24h, low24h: t.low24h, quoteVolume24h: t.quoteVolume24h, updatedAt: t.updatedAt, source: `${t.source} spot` };
      }
      const base = getEnv().BINANCE_FUTURES_REST_URL.replace(/\/$/, "");
      const t = await fetchJson<{ lastPrice: string; priceChangePercent: string; highPrice: string; lowPrice: string; quoteVolume: string; closeTime: number }>(`${base}/fapi/v1/ticker/24hr?symbol=${asset.binancePair}`, OPTS);
      return { price: +t.lastPrice, changePct24h: +t.priceChangePercent, high24h: +t.highPrice, low24h: +t.lowPrice, quoteVolume24h: +t.quoteVolume, updatedAt: t.closeTime || Date.now(), source: "Binance USDⓈ-M" };
    }
    if (venue === "bybit") {
      const { result, time } = await bybit<{ list: Array<{ lastPrice: string; price24hPcnt: string; highPrice24h: string; lowPrice24h: string; turnover24h: string }> }>(
        `/v5/market/tickers?category=${inst === "spot" ? "spot" : "linear"}&symbol=${asset.binancePair}`,
      );
      const t = result.list[0];
      if (!t) throw new ProviderError("bybit", "ticker vazio");
      return { price: +t.lastPrice, changePct24h: +t.price24hPcnt * 100, high24h: +t.highPrice24h, low24h: +t.lowPrice24h, quoteVolume24h: +t.turnover24h, updatedAt: time, source: `Bybit ${inst === "spot" ? "spot" : "linear"}` };
    }
    const [t] = await okx<Array<{ last: string; open24h: string; high24h: string; low24h: string; volCcy24h: string; ts: string }>>(`/market/ticker?instId=${okxInst(asset, inst)}`);
    if (!t) throw new ProviderError("okx", "ticker vazio");
    const last = +t.last;
    // SPOT: volCcy24h em moeda de cotação; SWAP: em moeda base → converte pelo último preço
    const qv = inst === "spot" ? +t.volCcy24h : +t.volCcy24h * last;
    return { price: last, changePct24h: ((last - +t.open24h) / +t.open24h) * 100, high24h: +t.high24h, low24h: +t.low24h, quoteVolume24h: qv, updatedAt: +t.ts || Date.now(), source: `OKX ${inst === "spot" ? "spot" : "swap"}` };
  } catch (err) {
    venueError(venue, err);
  }
}

export async function getVenueTicker(venue: Venue, inst: Instrument, asset: AssetDefinition): Promise<VenueTicker> {
  if (venue === "binance" && inst === "spot") return rawTicker(venue, inst, asset);
  const r = await cached<VenueTicker>(`vticker:v1:${venue}:${inst}:${asset.symbol}`, 10, () => rawTicker(venue, inst, asset), { staleTtlSeconds: 300 });
  return r.value;
}

/* ------------------------------------------------------------------ derivativos */

async function bybitDerivatives(asset: AssetDefinition): Promise<VenueDerivatives> {
  const pair = asset.binancePair;
  const { result, time } = await bybit<{
    list: Array<{ markPrice: string; indexPrice: string; fundingRate: string; nextFundingTime: string; openInterest: string; openInterestValue: string }>;
  }>(`/v5/market/tickers?category=linear&symbol=${pair}`);
  const t = result.list[0];
  if (!t) throw new ProviderError("bybit", "ticker linear vazio");
  const opt = async <T>(p: Promise<T>) => {
    try {
      return await p;
    } catch {
      return null;
    }
  };
  const [oiHist, ratio] = await Promise.all([
    opt(bybit<{ list: Array<{ openInterest: string; timestamp: string }> }>(`/v5/market/open-interest?category=linear&symbol=${pair}&intervalTime=1h&limit=25`)),
    opt(bybit<{ list: Array<{ buyRatio: string; sellRatio: string }> }>(`/v5/market/account-ratio?category=linear&symbol=${pair}&period=1h&limit=1`)),
  ]);
  const now = oiHist?.result.list[0] ? +oiHist.result.list[0].openInterest : NaN;
  const d24 = oiHist?.result.list[24] ? +oiHist.result.list[24].openInterest : NaN;
  const r = ratio?.result.list[0];
  const buy = r ? +r.buyRatio : NaN;
  const sell = r ? +r.sellRatio : NaN;
  return {
    exchange: "bybit",
    symbol: asset.symbol,
    pair,
    markPrice: +t.markPrice,
    indexPrice: +t.indexPrice,
    fundingRate: +t.fundingRate,
    nextFundingTime: +t.nextFundingTime,
    openInterest: +t.openInterest,
    openInterestUsd: Number.isFinite(+t.openInterestValue) ? +t.openInterestValue : null,
    openInterestChange24hPct: Number.isFinite(now) && Number.isFinite(d24) && d24 > 0 ? ((now - d24) / d24) * 100 : null,
    longShortRatio: Number.isFinite(buy) && Number.isFinite(sell) && sell > 0 ? buy / sell : null,
    longAccountPct: Number.isFinite(buy) ? buy * 100 : null,
    takerBuySellRatio: null,
    takerBuyVol: null,
    takerSellVol: null,
    updatedAt: time,
  };
}

/** Derivativos do perpétuo USDT na venue escolhida (sem trocar de exchange: derivativos são específicos da venue). */
export async function getVenueDerivatives(venue: Venue, asset: AssetDefinition): Promise<{ value: VenueDerivatives; stale: boolean }> {
  const r = await cached<VenueDerivatives>(
    `vderiv:v1:${venue}:${asset.symbol}`,
    60,
    async () => {
      try {
        if (venue === "binance") return { ...(await getDerivativesSnapshot(asset.symbol, asset.binancePair)), exchange: "binance" as const };
        if (venue === "okx") {
          const { instId: _i, ...rest } = await getOkxDerivativesSnapshot(asset.symbol);
          void _i;
          return { ...rest, exchange: "okx" as const };
        }
        return await bybitDerivatives(asset);
      } catch (err) {
        venueError(venue, err);
      }
    },
    { staleTtlSeconds: 600 },
  );
  return { value: r.value, stale: r.stale };
}

/* ------------------------------------------------------------------ status por exchange */

export interface VenueStatus {
  venue: Venue;
  label: string;
  status: "LIVE" | "DELAYED" | "DEGRADED" | "OFFLINE";
  latencyMs: number | null;
  checkedAt: number;
  /** último dado de mercado recebido (ticker BTC) */
  lastUpdate: number | null;
  error: string | null;
}

async function ping(venue: Venue): Promise<{ lastUpdate: number | null }> {
  if (venue === "binance") {
    await binanceProvider.ping();
    return { lastUpdate: Date.now() };
  }
  if (venue === "bybit") {
    const { time } = await bybit<unknown>("/v5/market/time");
    return { lastUpdate: time };
  }
  const [t] = await okx<Array<{ ts: string }>>("/public/time");
  return { lastUpdate: t ? +t.ts : Date.now() };
}

/** Latência e disponibilidade das 3 exchanges (cache 30 s). DEGRADED acima de 1,5 s; DELAYED quando o relógio da venue diverge > 60 s. */
export async function getVenueStatuses(): Promise<VenueStatus[]> {
  const r = await cached<VenueStatus[]>("venues:status:v1", 30, async () =>
    Promise.all(
      VENUES.map(async (venue): Promise<VenueStatus> => {
        const t0 = Date.now();
        try {
          const { lastUpdate } = await ping(venue);
          const latencyMs = Date.now() - t0;
          const skew = lastUpdate != null ? Math.abs(Date.now() - lastUpdate) : 0;
          return { venue, label: VENUE_LABEL[venue], status: skew > 60_000 ? "DELAYED" : latencyMs > 1500 ? "DEGRADED" : "LIVE", latencyMs, checkedAt: Date.now(), lastUpdate, error: null };
        } catch (err) {
          const e = err instanceof HttpError ? `HTTP ${err.status}` : (err as Error).message;
          return { venue, label: VENUE_LABEL[venue], status: "OFFLINE", latencyMs: null, checkedAt: Date.now(), lastUpdate: null, error: e };
        }
      }),
    ),
  );
  return r.value;
}
