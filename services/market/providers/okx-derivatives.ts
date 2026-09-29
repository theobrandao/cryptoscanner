import { fetchJson } from "@/lib/http";
import { ProviderError } from "@/services/market/providers/types";
import type { DerivativesSnapshot } from "@/services/market/providers/binance-futures";

/**
 * OKX — API pública de swaps perpétuos USDT (sem chave). Fallback quando a Binance Futures
 * não responde (ex.: HTTP 451 regional). Instrumento: {BASE}-USDT-SWAP.
 * Docs: okx.com/docs-v5 (public/funding-rate, public/open-interest, public/mark-price, rubik/stat).
 */
const BASE = "https://www.okx.com/api/v5";
type OkxResp<T> = { code: string; msg: string; data: T };

async function okx<T>(path: string): Promise<T> {
  const r = await fetchJson<OkxResp<T>>(`${BASE}${path}`, { retries: 1, timeoutMs: 6000 });
  if (r.code !== "0") throw new ProviderError("okx", `code ${r.code} ${r.msg}`);
  return r.data;
}

async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export async function getOkxDerivativesSnapshot(symbol: string): Promise<DerivativesSnapshot & { exchange: "okx"; instId: string }> {
  const instId = `${symbol.toUpperCase()}-USDT-SWAP`;
  let funding: Array<{ fundingRate: string; nextFundingTime?: string; fundingTime: string; ts?: string }>;
  let oi: Array<{ oi: string; oiUsd: string; ts: string }>;
  try {
    [funding, oi] = await Promise.all([okx<typeof funding>(`/public/funding-rate?instId=${instId}`), okx<typeof oi>(`/public/open-interest?instType=SWAP&instId=${instId}`)]);
  } catch (err) {
    throw err instanceof ProviderError ? err : new ProviderError("okx", (err as Error).message);
  }
  const [mark, oiHist, taker, index] = await Promise.all([
    optional(okx<Array<{ markPx: string; ts: string }>>(`/public/mark-price?instType=SWAP&instId=${instId}`)),
    // [ts, openInterestUsd, volumeUsd] — mais recente primeiro
    optional(okx<string[][]>(`/rubik/stat/contracts/open-interest-volume?ccy=${symbol.toUpperCase()}&period=1H`)),
    // [ts, sellVol, buyVol] — mais recente primeiro
    optional(okx<string[][]>(`/rubik/stat/taker-volume?ccy=${symbol.toUpperCase()}&instType=CONTRACTS&period=1H`)),
    optional(okx<Array<{ idxPx: string }>>(`/market/index-tickers?instId=${symbol.toUpperCase()}-USDT`)),
  ]);
  const f = funding[0];
  const o = oi[0];
  if (!f || !o) throw new ProviderError("okx", `sem dados para ${instId}`);
  const markPrice = mark?.[0] ? Number(mark[0].markPx) : NaN;
  const nowOi = oiHist?.[0] ? Number(oiHist[0][1]) : NaN;
  const oi24 = oiHist?.[24] ? Number(oiHist[24][1]) : NaN;
  const t = taker?.[0];
  const sell = t ? Number(t[1]) : NaN;
  const buy = t ? Number(t[2]) : NaN;
  return {
    exchange: "okx",
    instId,
    symbol: symbol.toUpperCase(),
    pair: `${symbol.toUpperCase()}USDT`,
    markPrice,
    indexPrice: index?.[0] ? Number(index[0].idxPx) : NaN,
    fundingRate: Number(f.fundingRate),
    nextFundingTime: Number(f.nextFundingTime ?? f.fundingTime),
    openInterest: Number(o.oi),
    openInterestUsd: Number.isFinite(Number(o.oiUsd)) ? Number(o.oiUsd) : null,
    openInterestChange24hPct: Number.isFinite(nowOi) && Number.isFinite(oi24) && oi24 > 0 ? ((nowOi - oi24) / oi24) * 100 : null,
    longShortRatio: null,
    longAccountPct: null,
    takerBuySellRatio: Number.isFinite(buy) && Number.isFinite(sell) && sell > 0 ? buy / sell : null,
    takerBuyVol: Number.isFinite(buy) ? buy : null,
    takerSellVol: Number.isFinite(sell) ? sell : null,
    updatedAt: Number(o.ts) || Date.now(),
  };
}
