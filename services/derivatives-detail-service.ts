import { getAsset } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { VENUE_LABEL, VENUES, type Venue } from "@/lib/venues";
import { getVenueDerivatives, type VenueDerivatives } from "@/services/market/venues";
import { ProviderError } from "@/services/market/providers/types";
import type { AssetDefinition } from "@/types/market";

/**
 * Derivativos em detalhe (View Details): comparativo por exchange (OI, funding, próximo funding, long/short,
 * basis = (mark − índice)/índice) e séries históricas de UMA exchange identificada: funding (últimas
 * liquidações de funding), open interest 1h e CVD aproximado pelo volume taker (compra − venda acumulado).
 * Liquidações não têm endpoint público gratuito confiável: exibidas como indisponíveis.
 */
export interface VenueRow {
  venue: Venue;
  label: string;
  ok: boolean;
  error: string | null;
  markPrice: number | null;
  indexPrice: number | null;
  basisPct: number | null;
  fundingRatePct: number | null;
  nextFundingTime: number | null;
  openInterestUsd: number | null;
  openInterestChange24hPct: number | null;
  longShortRatio: number | null;
  updatedAt: number | null;
}

export interface Point {
  time: number;
  value: number;
}

export interface DerivativesDetail {
  symbol: string;
  generatedAt: number;
  venues: VenueRow[];
  aggregated: { openInterestUsd: number | null; venues: number; weightedFundingPct: number | null };
  history: {
    venue: Venue | null;
    funding: Point[];
    openInterestUsd: Point[];
    cvd: Point[];
    takerBuyPct: Point[];
    errors: string[];
  };
  liquidations: { available: false; note: string };
}

const fin = (v: number) => (Number.isFinite(v) ? v : null);

function rowOf(venue: Venue, d: VenueDerivatives | null, err: string | null): VenueRow {
  const mark = d ? fin(d.markPrice) : null;
  const index = d ? fin(d.indexPrice) : null;
  return {
    venue,
    label: VENUE_LABEL[venue],
    ok: Boolean(d),
    error: err,
    markPrice: mark,
    indexPrice: index,
    basisPct: mark != null && index != null && index > 0 ? ((mark - index) / index) * 100 : null,
    fundingRatePct: d && Number.isFinite(d.fundingRate) ? d.fundingRate * 100 : null,
    nextFundingTime: d && Number.isFinite(d.nextFundingTime) ? d.nextFundingTime : null,
    openInterestUsd: d?.openInterestUsd ?? null,
    openInterestChange24hPct: d?.openInterestChange24hPct ?? null,
    longShortRatio: d?.longShortRatio ?? null,
    updatedAt: d?.updatedAt ?? null,
  };
}

const OPTS = { retries: 1, timeoutMs: 7000 };

async function binanceHistory(a: AssetDefinition) {
  const base = getEnv().BINANCE_FUTURES_REST_URL.replace(/\/$/, "");
  const [f, oi, tk] = await Promise.all([
    fetchJson<Array<{ fundingTime: number; fundingRate: string }>>(`${base}/fapi/v1/fundingRate?symbol=${a.binancePair}&limit=30`, OPTS),
    fetchJson<Array<{ timestamp: number; sumOpenInterestValue: string }>>(`${base}/futures/data/openInterestHist?symbol=${a.binancePair}&period=1h&limit=48`, OPTS),
    fetchJson<Array<{ timestamp: number; buyVol: string; sellVol: string }>>(`${base}/futures/data/takerlongshortRatio?symbol=${a.binancePair}&period=1h&limit=48`, OPTS),
  ]);
  return {
    funding: f.map((x) => ({ time: x.fundingTime, value: Number(x.fundingRate) * 100 })),
    oi: oi.map((x) => ({ time: x.timestamp, value: Number(x.sumOpenInterestValue) })),
    // volumes em moeda base → aproximação em USD não é necessária para o delta relativo
    taker: tk.map((x) => ({ time: x.timestamp, buy: Number(x.buyVol), sell: Number(x.sellVol) })),
  };
}

async function bybitHistory(a: AssetDefinition) {
  type R<T> = { retCode: number; retMsg: string; result: { list: T[] } };
  const get = async <T>(path: string) => {
    const r = await fetchJson<R<T>>(`https://api.bybit.com${path}`, OPTS);
    if (r.retCode !== 0) throw new ProviderError("bybit", r.retMsg);
    return r.result.list;
  };
  const [f, oi] = await Promise.all([
    get<{ fundingRateTimestamp: string; fundingRate: string }>(`/v5/market/funding/history?category=linear&symbol=${a.binancePair}&limit=30`),
    get<{ timestamp: string; openInterest: string }>(`/v5/market/open-interest?category=linear&symbol=${a.binancePair}&intervalTime=1h&limit=48`),
  ]);
  return {
    funding: f.map((x) => ({ time: Number(x.fundingRateTimestamp), value: Number(x.fundingRate) * 100 })).reverse(),
    // Bybit devolve OI em contratos (moeda base); sem conversão para USD aqui
    oi: [] as Point[],
    oiBase: oi.map((x) => ({ time: Number(x.timestamp), value: Number(x.openInterest) })).reverse(),
    taker: [] as Array<{ time: number; buy: number; sell: number }>,
  };
}

async function okxHistory(a: AssetDefinition) {
  type R<T> = { code: string; msg: string; data: T };
  const get = async <T>(path: string) => {
    const r = await fetchJson<R<T>>(`https://www.okx.com/api/v5${path}`, OPTS);
    if (r.code !== "0") throw new ProviderError("okx", r.msg);
    return r.data;
  };
  const [f, oi, tk] = await Promise.all([
    get<Array<{ fundingTime: string; fundingRate: string; realizedRate?: string }>>(`/public/funding-rate-history?instId=${a.symbol}-USDT-SWAP&limit=30`),
    get<string[][]>(`/rubik/stat/contracts/open-interest-volume?ccy=${a.symbol}&period=1H`),
    get<string[][]>(`/rubik/stat/taker-volume?ccy=${a.symbol}&instType=CONTRACTS&period=1H`),
  ]);
  return {
    funding: f.map((x) => ({ time: Number(x.fundingTime), value: Number(x.realizedRate ?? x.fundingRate) * 100 })).reverse(),
    oi: oi.slice(0, 48).map((x) => ({ time: Number(x[0]), value: Number(x[1]) })).reverse(),
    // [ts, sellVol, buyVol] (USD)
    taker: tk.slice(0, 48).map((x) => ({ time: Number(x[0]), sell: Number(x[1]), buy: Number(x[2]) })).reverse(),
  };
}

export async function getDerivativesDetail(symbol: string, prefer: Venue = "binance"): Promise<DerivativesDetail> {
  const asset = getAsset(symbol);
  if (!asset) throw new Error(`Ativo desconhecido: ${symbol}`);
  const res = await cached<DerivativesDetail>(`derivdetail:v1:${asset.symbol}:${prefer}`, 60, async () => {
    const venues = await Promise.all(
      VENUES.map(async (v) => {
        try {
          return rowOf(v, (await getVenueDerivatives(v, asset)).value, null);
        } catch (err) {
          return rowOf(v, null, (err as Error).message);
        }
      }),
    );
    const live = venues.filter((v) => v.ok && v.openInterestUsd != null);
    const totalOi = live.reduce((s, v) => s + (v.openInterestUsd ?? 0), 0);
    const wf = live.filter((v) => v.fundingRatePct != null);
    const weightedFunding = wf.length && totalOi > 0 ? wf.reduce((s, v) => s + (v.fundingRatePct as number) * (v.openInterestUsd as number), 0) / wf.reduce((s, v) => s + (v.openInterestUsd as number), 0) : null;

    const errors: string[] = [];
    const order: Venue[] = [prefer, ...(["binance", "okx", "bybit"] as Venue[]).filter((v) => v !== prefer)];
    let history: DerivativesDetail["history"] = { venue: null, funding: [], openInterestUsd: [], cvd: [], takerBuyPct: [], errors };
    for (const v of order) {
      try {
        const h = v === "binance" ? await binanceHistory(asset) : v === "bybit" ? await bybitHistory(asset) : await okxHistory(asset);
        let cum = 0;
        const cvd = h.taker.map((x) => ((cum += x.buy - x.sell), { time: x.time, value: cum }));
        history = {
          venue: v,
          funding: h.funding.filter((p) => Number.isFinite(p.value)),
          openInterestUsd: h.oi.filter((p) => Number.isFinite(p.value)),
          cvd,
          takerBuyPct: h.taker.map((x) => ({ time: x.time, value: x.buy + x.sell > 0 ? (x.buy / (x.buy + x.sell)) * 100 : NaN })).filter((p) => Number.isFinite(p.value)),
          errors,
        };
        break;
      } catch (err) {
        errors.push(`${VENUE_LABEL[v]}: ${(err as Error).message}`);
      }
    }
    return {
      symbol: asset.symbol,
      generatedAt: Date.now(),
      venues,
      aggregated: { openInterestUsd: live.length ? totalOi : null, venues: live.length, weightedFundingPct: weightedFunding },
      history,
      liquidations: { available: false, note: "Liquidações agregadas não têm endpoint público gratuito confiável; não exibimos valor estimado." },
    };
  });
  return res.value;
}
