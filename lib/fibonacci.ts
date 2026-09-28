import type { Candle } from "@/types/market";
import { round } from "@/lib/indicators/core";

export const FIB_RETRACEMENTS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const FIB_EXTENSIONS = [1.272, 1.414, 1.618, 2, 2.618] as const;

export interface FibLevel {
  ratio: number;
  price: number;
  kind: "retracement" | "extension";
}

export interface FibResult {
  high: number;
  low: number;
  direction: "up" | "down";
  levels: FibLevel[];
}

/**
 * Níveis de Fibonacci entre dois pontos. Para um movimento de alta (low → high),
 * as retrações descem a partir da máxima; para baixa (high → low), sobem a partir da mínima.
 */
export function fibonacciLevels(high: number, low: number, direction: "up" | "down"): FibResult {
  if (!(high > low)) throw new Error("high deve ser maior que low");
  const diff = high - low;
  const levels: FibLevel[] = [];
  for (const r of FIB_RETRACEMENTS) {
    const price = direction === "up" ? high - diff * r : low + diff * r;
    levels.push({ ratio: r, price: round(price, 8), kind: "retracement" });
  }
  for (const r of FIB_EXTENSIONS) {
    const price = direction === "up" ? low + diff * r : high - diff * r;
    levels.push({ ratio: r, price: round(price, 8), kind: "extension" });
  }
  return { high, low, direction, levels };
}

/** Escolhe automaticamente o swing (máxima/mínima) das últimas `lookback` barras. */
export function autoFibonacci(candles: readonly Candle[], lookback = 60): FibResult | null {
  const win = candles.slice(-lookback);
  if (win.length < 5) return null;
  let hi = -Infinity;
  let hiIdx = -1;
  let lo = Infinity;
  let loIdx = -1;
  win.forEach((c, i) => {
    if (c.high > hi) {
      hi = c.high;
      hiIdx = i;
    }
    if (c.low < lo) {
      lo = c.low;
      loIdx = i;
    }
  });
  if (hi <= lo) return null;
  return fibonacciLevels(hi, lo, hiIdx > loIdx ? "up" : "down");
}
