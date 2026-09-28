import type { Candle } from "@/types/market";

export interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
  time: number;
}

/**
 * Pivôs fractais: um topo é a maior máxima numa janela de `left` barras à esquerda
 * e `right` à direita; um fundo, analogamente com as mínimas.
 */
export function findPivots(candles: readonly Candle[], left = 3, right = 3): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    if (!c) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      const o = candles[j];
      if (!o) continue;
      if (o.high >= c.high) isHigh = false;
      if (o.low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, price: c.high, kind: "high", time: c.openTime });
    if (isLow) pivots.push({ index: i, price: c.low, kind: "low", time: c.openTime });
  }
  return pivots;
}

export interface Level {
  price: number;
  kind: "support" | "resistance";
  /** número de toques (pivôs agrupados) */
  touches: number;
  /** 0..1 — combina toques e recência */
  strength: number;
  lastTouchIndex: number;
}

/**
 * Agrupa pivôs próximos (tolerância relativa) em níveis de suporte/resistência.
 * Um nível é suporte se está abaixo do preço atual e resistência se está acima.
 */
export function supportResistance(candles: readonly Candle[], options: { left?: number; right?: number; tolerancePct?: number; maxLevels?: number } = {}): { supports: Level[]; resistances: Level[] } {
  const { left = 3, right = 3, tolerancePct = 0.006, maxLevels = 4 } = options;
  const lastCandle = candles[candles.length - 1];
  if (!lastCandle || candles.length < left + right + 2) return { supports: [], resistances: [] };
  const price = lastCandle.close;
  const pivots = findPivots(candles, left, right);

  interface Cluster {
    prices: number[];
    indices: number[];
  }
  const clusters: Cluster[] = [];
  for (const p of pivots) {
    const c = clusters.find((cl) => {
      const mean = cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length;
      return Math.abs(p.price - mean) / mean <= tolerancePct;
    });
    if (c) {
      c.prices.push(p.price);
      c.indices.push(p.index);
    } else clusters.push({ prices: [p.price], indices: [p.index] });
  }

  const n = candles.length;
  const levels: Level[] = clusters.map((cl) => {
    const mean = cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length;
    const lastIdx = Math.max(...cl.indices);
    const recency = 1 - (n - 1 - lastIdx) / n; // 1 = mais recente
    const touches = cl.prices.length;
    const strength = Math.min(1, 0.25 * Math.min(touches, 3) + 0.4 * recency);
    return {
      price: mean,
      kind: mean <= price ? "support" : "resistance",
      touches,
      strength,
      lastTouchIndex: lastIdx,
    };
  });

  const supports = levels
    .filter((l) => l.kind === "support")
    .sort((a, b) => b.price - a.price) // mais próximo do preço primeiro
    .slice(0, maxLevels);
  const resistances = levels
    .filter((l) => l.kind === "resistance")
    .sort((a, b) => a.price - b.price)
    .slice(0, maxLevels);
  return { supports, resistances };
}

/** Regressão linear simples (inclinação por barra e R²) sobre uma série. */
export function linearRegression(values: readonly number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i] ?? 0;
    sx += i;
    sy += y;
    sxx += i * i;
    sxy += i * y;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i] ?? 0;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - (intercept + slope * i)) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}
