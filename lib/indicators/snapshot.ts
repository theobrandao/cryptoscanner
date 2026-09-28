import type { Candle, Direction } from "@/types/market";
import { atr, bollinger, ema, historicalVolatility, last, macd, roc, round, rsi, sma, stochRsi } from "@/lib/indicators/core";
import { supportResistance, linearRegression, type Level } from "@/lib/indicators/levels";

export interface IndicatorSnapshot {
  price: number;
  ema8: number;
  ema25: number;
  ema100: number;
  ema200: number;
  sma20: number;
  sma50: number;
  rsi14: number;
  macd: { line: number; signal: number; histogram: number };
  bollinger: { upper: number; middle: number; lower: number; bandwidth: number; percentB: number };
  atr14: number;
  /** ATR como % do preço */
  atrPct: number;
  stochRsi: { k: number; d: number };
  roc10: number;
  /** volatilidade histórica (desvio dos retornos log, 20 barras) em % */
  volatilityPct: number;
  /** volume do último candle / média dos 20 anteriores */
  relativeVolume: number;
  /** inclinação normalizada da regressão das últimas 20 barras (% por barra) */
  slopePct: number;
  trend: Direction;
  trendStrength: number; // 0..100
  momentum: "strong_up" | "up" | "flat" | "down" | "strong_down";
  supports: Level[];
  resistances: Level[];
  breakout: "up" | "down" | null;
  candlesUsed: number;
}

/**
 * Calcula todos os indicadores usados pelo scanner e pelos agentes a partir de um array de candles.
 * Requer ao menos 30 candles; com menos, os campos de longo período ficam NaN.
 */
export function computeSnapshot(candles: readonly Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const lastCandle = candles[candles.length - 1];
  const price = lastCandle?.close ?? NaN;

  const e8 = last(ema(closes, 8));
  const e25 = last(ema(closes, 25));
  const e100 = last(ema(closes, 100));
  const e200 = last(ema(closes, 200));
  const s20 = last(sma(closes, 20));
  const s50 = last(sma(closes, 50));
  const r = last(rsi(closes, 14));
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = last(atr(candles, 14));
  const st = stochRsi(closes);
  const rocV = last(roc(closes, 10));
  const hv = last(historicalVolatility(closes, 20));

  // Volume relativo: último candle vs. média dos 20 anteriores (exclui o último).
  const prevVols = volumes.slice(Math.max(0, volumes.length - 21), volumes.length - 1);
  const avgVol = prevVols.length ? prevVols.reduce((x, y) => x + y, 0) / prevVols.length : NaN;
  const relVol = avgVol > 0 ? (volumes[volumes.length - 1] ?? 0) / avgVol : NaN;

  const window = closes.slice(-20);
  const reg = linearRegression(window);
  const slopePct = window.length && price ? (reg.slope / price) * 100 : NaN;

  const { supports, resistances } = supportResistance(candles);

  const trendInfo = classifyTrend({ price, e8, e25, e100, slopePct, r2: reg.r2 });
  const momentum = classifyMomentum({ rsi: r, macdHist: last(m.histogram), roc: rocV, price });

  // Rompimento: fechamento acima da resistência mais próxima ou abaixo do suporte mais próximo,
  // considerando o candle anterior ainda dentro do intervalo.
  let breakout: "up" | "down" | null = null;
  const prev = candles[candles.length - 2];
  const nearestRes = resistances[0];
  const nearestSup = supports[0];
  // supportResistance classifica pelo preço atual, então usamos os pivôs do candle anterior:
  if (prev && lastCandle) {
    const { supports: ps, resistances: pr } = supportResistance(candles.slice(0, -1));
    const prevRes = pr[0];
    const prevSup = ps[0];
    if (prevRes && lastCandle.close > prevRes.price && prev.close <= prevRes.price) breakout = "up";
    if (prevSup && lastCandle.close < prevSup.price && prev.close >= prevSup.price) breakout = "down";
  }
  void nearestRes;
  void nearestSup;

  return {
    price,
    ema8: e8,
    ema25: e25,
    ema100: e100,
    ema200: e200,
    sma20: s20,
    sma50: s50,
    rsi14: round(r, 2),
    macd: { line: last(m.macd), signal: last(m.signal), histogram: last(m.histogram) },
    bollinger: {
      upper: last(bb.upper),
      middle: last(bb.middle),
      lower: last(bb.lower),
      bandwidth: round(last(bb.bandwidth), 4),
      percentB: round(last(bb.percentB), 3),
    },
    atr14: a,
    atrPct: price ? round((a / price) * 100, 3) : NaN,
    stochRsi: { k: round(last(st.k), 2), d: round(last(st.d), 2) },
    roc10: round(rocV, 3),
    volatilityPct: round(hv * 100, 3),
    relativeVolume: round(relVol, 2),
    slopePct: round(slopePct, 4),
    trend: trendInfo.trend,
    trendStrength: trendInfo.strength,
    momentum,
    supports,
    resistances,
    breakout,
    candlesUsed: candles.length,
  };
}

function classifyTrend(input: { price: number; e8: number; e25: number; e100: number; slopePct: number; r2: number }): { trend: Direction; strength: number } {
  const { price, e8, e25, e100, slopePct, r2 } = input;
  let score = 0; // -4..+4
  if (Number.isFinite(e8) && Number.isFinite(e25)) score += e8 > e25 ? 1 : -1;
  if (Number.isFinite(e25) && Number.isFinite(e100)) score += e25 > e100 ? 1 : -1;
  if (Number.isFinite(e25)) score += price > e25 ? 1 : -1;
  if (Number.isFinite(slopePct)) {
    if (slopePct > 0.05) score += 1;
    else if (slopePct < -0.05) score -= 1;
  }
  const strength = Math.min(100, Math.round((Math.abs(score) / 4) * 70 + (Number.isFinite(r2) ? r2 * 30 : 0)));
  if (score >= 2) return { trend: "bullish", strength };
  if (score <= -2) return { trend: "bearish", strength };
  return { trend: "neutral", strength };
}

function classifyMomentum(input: { rsi: number; macdHist: number; roc: number; price: number }) {
  const { rsi: r, macdHist, roc: rc, price } = input;
  let score = 0;
  if (Number.isFinite(r)) {
    if (r >= 65) score += 1;
    else if (r <= 35) score -= 1;
  }
  if (Number.isFinite(macdHist) && price) {
    const rel = (macdHist / price) * 100;
    if (rel > 0.1) score += 1;
    else if (rel < -0.1) score -= 1;
  }
  if (Number.isFinite(rc)) {
    if (rc > 2) score += 1;
    else if (rc < -2) score -= 1;
  }
  if (score >= 3) return "strong_up" as const;
  if (score >= 1) return "up" as const;
  if (score <= -3) return "strong_down" as const;
  if (score <= -1) return "down" as const;
  return "flat" as const;
}
