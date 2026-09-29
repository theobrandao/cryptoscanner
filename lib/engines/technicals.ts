import type { Candle } from "@/types/market";
import { atr, bollinger, ema, macd, rsi } from "@/lib/indicators/core";
import { strengthPivots } from "@/lib/engines/structure";

/**
 * Technicals Engine — indicadores do contrato V2 sobre candles FECHADOS.
 * EMA 9/21/50/100/200, RSI(14) com inclinação, MACD(12,26,9), ATR(14) e percentil,
 * Bollinger(20,2) e largura, VWAP diária ancorada em 00:00 UTC, volume relativo e z-score,
 * divergências regulares/ocultas de RSI em pivôs confirmados.
 */

export interface Technicals {
  close: number;
  ema: { e9: number | null; e21: number | null; e50: number | null; e100: number | null; e200: number | null };
  /** −100..100: ordem preço/EMAs + inclinação da EMA50 */
  emaScore: number;
  rsi: number | null;
  /** variação do RSI nas últimas 3 barras */
  rsiSlope: number | null;
  macd: { macd: number | null; signal: number | null; histogram: number | null; histogramRising: boolean | null };
  atr: number | null;
  atrPct: number | null;
  /** percentil do ATR% nas últimas 100 barras (0–100) */
  atrPercentile: number | null;
  volatility: "VERY_LOW" | "LOW" | "NORMAL" | "HIGH" | "EXTREME" | null;
  bollinger: { upper: number | null; middle: number | null; lower: number | null; bandwidthPct: number | null };
  /** VWAP do dia UTC corrente (candles fechados do dia); null em TF ≥ 1D */
  vwap: number | null;
  vwapDistanceAtr: number | null;
  /** volume do último candle fechado ÷ média de 20 candles anteriores */
  rvol: number | null;
  volumeZ: number | null;
  divergences: Divergence[];
}

export interface Divergence {
  type: "regular_bullish" | "regular_bearish" | "hidden_bullish" | "hidden_bearish";
  /** barras desde o segundo pivô */
  barsAgo: number;
  priceFrom: number;
  priceTo: number;
  rsiFrom: number;
  rsiTo: number;
}

const fin = (v: number | undefined | null): number | null => (v != null && Number.isFinite(v) ? v : null);
const lastOf = (a: readonly number[]) => fin(a[a.length - 1]);

export function volatilityClass(pct: number | null): Technicals["volatility"] {
  if (pct == null) return null;
  if (pct < 10) return "VERY_LOW";
  if (pct < 30) return "LOW";
  if (pct <= 70) return "NORMAL";
  if (pct <= 90) return "HIGH";
  return "EXTREME";
}

/** VWAP a partir do primeiro candle do dia UTC do último candle (preço típico × volume). */
export function sessionVwap(candles: readonly Candle[]): number | null {
  const last = candles[candles.length - 1];
  if (!last) return null;
  const dayStart = Math.floor(last.openTime / 86_400_000) * 86_400_000;
  let pv = 0;
  let v = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i] as Candle;
    if (c.openTime < dayStart) break;
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : null;
}

/**
 * Divergências entre os dois últimos pivôs confirmados (força 3) do mesmo tipo, dentro de 40 barras:
 * regular altista = preço fundo mais baixo e RSI fundo mais alto; oculta altista = preço fundo mais alto e RSI mais baixo (e espelhos).
 */
export function rsiDivergences(candles: readonly Candle[], rsiSeries: readonly number[], strength = 3, window = 40): Divergence[] {
  const piv = strengthPivots(candles, strength);
  const out: Divergence[] = [];
  const lastIdx = candles.length - 1;
  for (const kind of ["low", "high"] as const) {
    const list = piv.filter((p) => p.kind === kind && lastIdx - p.index <= window);
    const a = list[list.length - 2];
    const b = list[list.length - 1];
    if (!a || !b) continue;
    const ra = rsiSeries[a.index];
    const rb = rsiSeries[b.index];
    if (!Number.isFinite(ra) || !Number.isFinite(rb)) continue;
    const base = { barsAgo: lastIdx - b.index, priceFrom: a.price, priceTo: b.price, rsiFrom: ra as number, rsiTo: rb as number };
    if (kind === "low") {
      if (b.price < a.price && (rb as number) > (ra as number)) out.push({ type: "regular_bullish", ...base });
      else if (b.price > a.price && (rb as number) < (ra as number)) out.push({ type: "hidden_bullish", ...base });
    } else {
      if (b.price > a.price && (rb as number) < (ra as number)) out.push({ type: "regular_bearish", ...base });
      else if (b.price < a.price && (rb as number) > (ra as number)) out.push({ type: "hidden_bearish", ...base });
    }
  }
  return out;
}

export function computeTechnicals(candles: readonly Candle[], opts: { intradayVwap?: boolean } = {}): Technicals {
  const closes = candles.map((c) => c.close);
  const close = closes[closes.length - 1] ?? NaN;
  const e = (p: number) => lastOf(ema(closes, p));
  const e9 = e(9);
  const e21 = e(21);
  const e50s = ema(closes, 50);
  const e50 = lastOf(e50s);
  const e100 = e(100);
  const e200 = e(200);
  let emaScore = 0;
  const cmp = (x: number | null, y: number | null, w: number) => {
    if (x == null || y == null) return;
    emaScore += x > y ? w : x < y ? -w : 0;
  };
  cmp(close, e21, 20);
  cmp(e21, e50, 20);
  cmp(e50, e200, 25);
  cmp(close, e200, 15);
  const e50prev = fin(e50s[e50s.length - 11]);
  if (e50 != null && e50prev != null) emaScore += e50 > e50prev ? 20 : e50 < e50prev ? -20 : 0;

  const r = rsi(closes, 14);
  const rNow = lastOf(r);
  const r3 = fin(r[r.length - 4]);
  const m = macd(closes);
  const h = lastOf(m.histogram);
  const hPrev = fin(m.histogram[m.histogram.length - 2]);
  const a = atr(candles, 14);
  const aNow = lastOf(a);
  const atrPcts = a.map((v, i) => (Number.isFinite(v) ? (v as number) / (closes[i] as number) : NaN));
  const window = atrPcts.slice(-100).filter((v) => Number.isFinite(v));
  const curPct = lastOf(atrPcts);
  const pctile = curPct != null && window.length >= 20 ? (window.filter((v) => v < curPct).length / window.length) * 100 : null;
  const bb = bollinger(closes, 20, 2);
  const up = lastOf(bb.upper);
  const mid = lastOf(bb.middle);
  const lo = lastOf(bb.lower);
  const vols = candles.map((c) => c.volume);
  const lastVol = vols[vols.length - 1];
  const prev = vols.slice(-21, -1);
  const mean = prev.length ? prev.reduce((s, x) => s + x, 0) / prev.length : NaN;
  const sd = prev.length > 1 ? Math.sqrt(prev.reduce((s, x) => s + (x - mean) ** 2, 0) / (prev.length - 1)) : NaN;
  const vwap = opts.intradayVwap === false ? null : sessionVwap(candles);
  return {
    close,
    ema: { e9, e21, e50, e100, e200 },
    emaScore: Math.max(-100, Math.min(100, emaScore)),
    rsi: rNow,
    rsiSlope: rNow != null && r3 != null ? rNow - r3 : null,
    macd: { macd: lastOf(m.macd), signal: lastOf(m.signal), histogram: h, histogramRising: h != null && hPrev != null ? h > hPrev : null },
    atr: aNow,
    atrPct: curPct != null ? curPct * 100 : null,
    atrPercentile: pctile,
    volatility: volatilityClass(pctile),
    bollinger: { upper: up, middle: mid, lower: lo, bandwidthPct: up != null && lo != null && mid ? ((up - lo) / mid) * 100 : null },
    vwap,
    vwapDistanceAtr: vwap != null && aNow ? (close - vwap) / aNow : null,
    rvol: lastVol != null && mean > 0 ? lastVol / mean : null,
    volumeZ: lastVol != null && sd > 0 ? (lastVol - mean) / sd : null,
    divergences: rsiDivergences(candles, r),
  };
}
