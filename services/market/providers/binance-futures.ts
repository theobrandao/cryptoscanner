import { getEnv } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";
import { ProviderError } from "@/services/market/providers/types";

/**
 * Binance Futures USDⓈ-M — endpoints públicos de derivativos (sem chave):
 * funding rate e mark price (premiumIndex), open interest atual e histórico, proporção long/short
 * de contas e agressão taker (compra vs. venda). Documentação: developers.binance.com (Futures USDⓈ-M).
 * Em regiões restritas a Binance responde 451; o painel indica indisponibilidade em vez de inventar dados.
 */
export interface DerivativesSnapshot {
  symbol: string; // BTC
  pair: string; // BTCUSDT
  markPrice: number;
  indexPrice: number;
  /** taxa de funding vigente (fração; 0.0001 = 0,01 %) */
  fundingRate: number;
  nextFundingTime: number;
  /** open interest em contratos (moeda base) e em USD */
  openInterest: number;
  openInterestUsd: number | null;
  /** variação do OI nas últimas 24 h (%), quando o histórico está disponível */
  openInterestChange24hPct: number | null;
  /** proporção de contas long/short (1,0 = equilíbrio) e % de contas long */
  longShortRatio: number | null;
  longAccountPct: number | null;
  /** agressão taker: volume comprador / vendedor (última hora) */
  takerBuySellRatio: number | null;
  takerBuyVol: number | null;
  takerSellVol: number | null;
  updatedAt: number;
}

interface PremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}
interface OpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}
interface OpenInterestHist {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}
interface LongShort {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}
interface TakerRatio {
  buySellRatio: string;
  buyVol: string;
  sellVol: string;
  timestamp: number;
}

function base(): string {
  return getEnv().BINANCE_FUTURES_REST_URL.replace(/\/$/, "");
}

function wrap(err: unknown): never {
  if (err instanceof HttpError) {
    throw new ProviderError("binance-futures", err.status === 451 ? "indisponível nesta região (HTTP 451)" : `HTTP ${err.status}`, err.status);
  }
  throw new ProviderError("binance-futures", err instanceof Error ? err.message : String(err));
}

async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** Snapshot de derivativos de um par perpétuo (ex.: BTCUSDT). */
export async function getDerivativesSnapshot(symbol: string, pair: string): Promise<DerivativesSnapshot> {
  const b = base();
  const opts = { retries: 1, timeoutMs: 6000 };
  let premium: PremiumIndex;
  let oi: OpenInterest;
  try {
    [premium, oi] = await Promise.all([fetchJson<PremiumIndex>(`${b}/fapi/v1/premiumIndex?symbol=${pair}`, opts), fetchJson<OpenInterest>(`${b}/fapi/v1/openInterest?symbol=${pair}`, opts)]);
  } catch (err) {
    wrap(err);
  }
  const [hist, ls, taker] = await Promise.all([
    optional(fetchJson<OpenInterestHist[]>(`${b}/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=25`, opts)),
    optional(fetchJson<LongShort[]>(`${b}/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=1h&limit=1`, opts)),
    optional(fetchJson<TakerRatio[]>(`${b}/futures/data/takerlongshortRatio?symbol=${pair}&period=1h&limit=1`, opts)),
  ]);
  const first = hist?.[0];
  const last = hist?.[hist.length - 1];
  const markPrice = Number(premium.markPrice);
  const openInterest = Number(oi.openInterest);
  const oiUsdFromHist = last ? Number(last.sumOpenInterestValue) : null;
  return {
    symbol,
    pair,
    markPrice,
    indexPrice: Number(premium.indexPrice),
    fundingRate: Number(premium.lastFundingRate),
    nextFundingTime: premium.nextFundingTime,
    openInterest,
    openInterestUsd: Number.isFinite(oiUsdFromHist ?? NaN) ? oiUsdFromHist : Number.isFinite(markPrice) ? openInterest * markPrice : null,
    openInterestChange24hPct: first && last && Number(first.sumOpenInterest) > 0 ? ((Number(last.sumOpenInterest) - Number(first.sumOpenInterest)) / Number(first.sumOpenInterest)) * 100 : null,
    longShortRatio: ls?.[0] ? Number(ls[0].longShortRatio) : null,
    longAccountPct: ls?.[0] ? Number(ls[0].longAccount) * 100 : null,
    takerBuySellRatio: taker?.[0] ? Number(taker[0].buySellRatio) : null,
    takerBuyVol: taker?.[0] ? Number(taker[0].buyVol) : null,
    takerSellVol: taker?.[0] ? Number(taker[0].sellVol) : null,
    updatedAt: premium.time ?? Date.now(),
  };
}
