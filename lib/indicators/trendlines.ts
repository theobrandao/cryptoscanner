import type { Candle } from "@/types/market";
import { findPivots, type Pivot } from "@/lib/indicators/levels";

/**
 * Linhas de tendência automáticas:
 *  - LTA (alta): reta por dois fundos pivô ascendentes, sem fechamento abaixo dela entre os dois pontos.
 *  - LTB (baixa): reta por dois topos pivô descendentes, sem fechamento acima dela entre os dois pontos.
 * A reta é projetada até o último candle; `broken` indica que o fechamento atual já cruzou a linha.
 * Toques = pivôs do mesmo tipo a menos de `touchTolerance` (fração do preço) da reta.
 */
export interface TrendLine {
  kind: "LTA" | "LTB";
  from: { index: number; time: number; price: number };
  to: { index: number; time: number; price: number };
  /** preço da linha no último candle */
  priceNow: number;
  slopePerBar: number;
  touches: number;
  broken: boolean;
}

function valueAt(a: Pivot, slope: number, index: number): number {
  return a.price + slope * (index - a.index);
}

function build(candles: readonly Candle[], pivots: Pivot[], kind: "LTA" | "LTB", tolerance: number): TrendLine | null {
  const lastIndex = candles.length - 1;
  const last = candles[lastIndex];
  if (!last) return null;
  const pts = pivots.filter((p) => p.kind === (kind === "LTA" ? "low" : "high"));
  // do par mais recente para o mais antigo: primeiro par válido vence
  for (let j = pts.length - 1; j >= 1; j--) {
    for (let i = j - 1; i >= Math.max(0, j - 4); i--) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (b.index - a.index < 5) continue;
      const ascending = b.price > a.price;
      if (kind === "LTA" ? !ascending : ascending) continue;
      const slope = (b.price - a.price) / (b.index - a.index);
      let valid = true;
      for (let k = a.index + 1; k < b.index; k++) {
        const c = candles[k]!;
        const line = valueAt(a, slope, k);
        if (kind === "LTA" ? c.close < line * (1 - tolerance) : c.close > line * (1 + tolerance)) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      const priceNow = valueAt(a, slope, lastIndex);
      if (priceNow <= 0) continue;
      const touches = pts.filter((p) => p.index >= a.index && Math.abs(p.price - valueAt(a, slope, p.index)) / p.price <= tolerance).length;
      return {
        kind,
        from: { index: a.index, time: a.time, price: a.price },
        to: { index: lastIndex, time: last.openTime, price: priceNow },
        priceNow,
        slopePerBar: slope,
        touches,
        broken: kind === "LTA" ? last.close < priceNow : last.close > priceNow,
      };
    }
  }
  return null;
}

export function detectTrendLines(candles: readonly Candle[], options: { lookback?: number; pivotWindow?: number; touchTolerance?: number } = {}): TrendLine[] {
  const { lookback = 150, pivotWindow = 4, touchTolerance = 0.004 } = options;
  if (candles.length < 30) return [];
  const offset = Math.max(0, candles.length - lookback);
  const slice = candles.slice(offset);
  const pivots = findPivots(slice, pivotWindow, pivotWindow);
  const out: TrendLine[] = [];
  for (const kind of ["LTA", "LTB"] as const) {
    const l = build(slice, pivots, kind, touchTolerance);
    if (l) out.push({ ...l, from: { ...l.from, index: l.from.index + offset }, to: { ...l.to, index: l.to.index + offset } });
  }
  return out;
}
