import type { Candle, Timeframe } from "@/types/market";
import { round } from "@/lib/indicators/core";

export interface VolumeAnomaly {
  symbol: string;
  timeframe: Timeframe;
  /** volume do candle anômalo */
  volume: number;
  /** média dos `baseline` candles anteriores */
  averageVolume: number;
  /** aumento percentual sobre a média (100 = dobrou) */
  increasePct: number;
  /** variação de preço do candle (%) */
  priceChangePct: number;
  direction: "up" | "down" | "flat";
  candleOpenTime: number;
  /** true quando o candle anômalo ainda está aberto */
  isCurrentCandle: boolean;
}

/**
 * Regra observada publicamente: "aumento de volume ≥ 100%" em candles de 30M e 1H.
 * Implementação própria: compara o volume dos últimos `recent` candles com a média
 * dos `baseline` anteriores; sinaliza o maior que exceder `thresholdPct`.
 */
export function detectVolumeAnomaly(
  symbol: string,
  timeframe: Timeframe,
  candles: readonly Candle[],
  options: { baseline?: number; recent?: number; thresholdPct?: number; now?: number } = {},
): VolumeAnomaly | null {
  const { baseline = 20, recent = 2, thresholdPct = 100, now = Date.now() } = options;
  if (candles.length < baseline + recent) return null;
  const base = candles.slice(-(baseline + recent), -recent);
  const avg = base.reduce((s, c) => s + c.volume, 0) / base.length;
  if (!(avg > 0)) return null;
  let best: VolumeAnomaly | null = null;
  for (const c of candles.slice(-recent)) {
    const inc = ((c.volume - avg) / avg) * 100;
    if (inc < thresholdPct) continue;
    const chg = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    const candidate: VolumeAnomaly = {
      symbol,
      timeframe,
      volume: c.volume,
      averageVolume: avg,
      increasePct: round(inc, 1),
      priceChangePct: round(chg, 2),
      direction: chg > 0.05 ? "up" : chg < -0.05 ? "down" : "flat",
      candleOpenTime: c.openTime,
      isCurrentCandle: c.closeTime > now,
    };
    if (!best || candidate.increasePct > best.increasePct) best = candidate;
  }
  return best;
}
