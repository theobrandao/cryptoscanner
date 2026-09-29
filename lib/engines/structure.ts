import type { Candle, Direction } from "@/types/market";
import { atr, trueRange } from "@/lib/indicators/core";

/**
 * Market Structure Engine.
 *
 * 1. Pivôs fractais com força k (k barras de cada lado). Um pivô só existe depois de k barras à direita
 *    (`confirmedAt = index + k`): nada aqui olha o futuro em relação ao instante de confirmação.
 * 2. Swings estruturais: pivôs alternados alto/baixo com amplitude mínima de `minAtr × ATR(14)` desde o
 *    swing oposto anterior. Dois altos seguidos → fica o mais extremo.
 * 3. Rótulos: HH/LH (altos) e HL/LL (baixos) contra o swing anterior do mesmo tipo.
 * 4. Eventos por FECHAMENTO: BOS (quebra a favor da tendência vigente), CHoCH (primeira quebra contra),
 *    MSS = CHoCH com deslocamento (corpo do candle de quebra ≥ 1 ATR).
 * 5. Falhas: pavio além do swing e fechamento de volta → failed breakout/breakdown (varredura de liquidez).
 */

export type SwingKind = "high" | "low";
export type SwingLabel = "HH" | "LH" | "HL" | "LL";

export interface Swing {
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
  /** barra em que o pivô ficou confirmado (index + k) */
  confirmedAt: number;
  label: SwingLabel | null;
}

export type StructureEventType = "BOS" | "CHoCH" | "MSS";

export interface StructureEvent {
  type: StructureEventType;
  direction: Exclude<Direction, "neutral">;
  /** barra do fechamento que quebrou o nível */
  index: number;
  time: number;
  /** preço do swing rompido */
  level: number;
  swingIndex: number;
  /** corpo do candle de quebra em ATR */
  displacementAtr: number;
}

export interface FailedBreak {
  type: "failed_breakout" | "failed_breakdown";
  index: number;
  time: number;
  level: number;
  swingIndex: number;
  /** quanto o pavio passou do nível, em ATR */
  depthAtr: number;
}

export interface StructureOptions {
  /** força do pivô (barras de cada lado) */
  strength?: number;
  /** amplitude mínima entre swings opostos em múltiplos de ATR(14) */
  minAtr?: number;
}

export interface StructureResult {
  strength: number;
  minAtr: number;
  swings: Swing[];
  events: StructureEvent[];
  failed: FailedBreak[];
  trend: Direction;
  lastEvent: StructureEvent | null;
  lastHigh: Swing | null;
  lastLow: Swing | null;
  /** faixa de negociação entre o último swing alto e o último swing baixo confirmados */
  range: { high: number; low: number; equilibrium: number } | null;
  /** posição do último fechamento na faixa: 0 = fundo, 1 = topo */
  rangePosition: number | null;
  location: "premium" | "discount" | "equilibrium" | null;
  atr: number;
}

export const EXTERNAL: Required<StructureOptions> = { strength: 5, minAtr: 1.5 };
export const INTERNAL: Required<StructureOptions> = { strength: 2, minAtr: 0.5 };

/** ATR(14) com aquecimento: antes da 14ª barra usa a média do true range acumulado (evita filtro nulo no início). */
export function atrWithWarmup(candles: readonly Candle[]): number[] {
  const a = atr(candles, 14);
  const tr = trueRange(candles);
  let sum = 0;
  return a.map((v, i) => {
    sum += tr[i] ?? 0;
    return Number.isFinite(v) ? v : sum / (i + 1);
  });
}

interface RawPivot {
  index: number;
  kind: SwingKind;
  price: number;
}

/** Pivôs com desempate: estritamente maior que a esquerda e maior ou igual à direita (o primeiro de topos iguais vale). */
export function strengthPivots(candles: readonly Candle[], k: number): RawPivot[] {
  const out: RawPivot[] = [];
  for (let i = k; i < candles.length - k; i++) {
    const c = candles[i] as Candle;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= k && (isHigh || isLow); j++) {
      const l = candles[i - j] as Candle;
      const r = candles[i + j] as Candle;
      if (!(c.high > l.high && c.high >= r.high)) isHigh = false;
      if (!(c.low < l.low && c.low <= r.low)) isLow = false;
    }
    if (isHigh) out.push({ index: i, kind: "high", price: c.high });
    if (isLow) out.push({ index: i, kind: "low", price: c.low });
  }
  return out;
}

export function buildSwings(candles: readonly Candle[], options: StructureOptions = {}): Swing[] {
  const k = options.strength ?? EXTERNAL.strength;
  const minAtr = options.minAtr ?? EXTERNAL.minAtr;
  const a = atrWithWarmup(candles);
  const pivots = strengthPivots(candles, k);
  const swings: Swing[] = [];
  const push = (p: RawPivot) => {
    const c = candles[p.index] as Candle;
    swings.push({ index: p.index, time: c.openTime, price: p.price, kind: p.kind, confirmedAt: p.index + k, label: null });
  };
  for (let n = 0; n < pivots.length; n++) {
    let p = pivots[n] as RawPivot;
    // barra externa (alto e baixo no mesmo índice): processa primeiro o tipo oposto ao último swing
    const next = pivots[n + 1];
    const lastSw = swings[swings.length - 1];
    if (next && next.index === p.index && lastSw && p.kind !== lastSw.kind && next.kind === lastSw.kind) {
      // já está na ordem certa (oposto primeiro)
    } else if (next && next.index === p.index && lastSw && p.kind === lastSw.kind) {
      pivots[n + 1] = p;
      p = next;
    }
    const last = swings[swings.length - 1];
    if (!last) {
      push(p);
      continue;
    }
    if (p.kind === last.kind) {
      const moreExtreme = p.kind === "high" ? p.price > last.price : p.price < last.price;
      if (moreExtreme) {
        swings.pop();
        push(p);
      }
      continue;
    }
    const atrHere = a[p.index];
    const need = Number.isFinite(atrHere) ? minAtr * (atrHere as number) : 0;
    if (Math.abs(p.price - last.price) >= need) push(p);
  }
  // rótulos
  let prevHigh: Swing | null = null;
  let prevLow: Swing | null = null;
  for (const s of swings) {
    if (s.kind === "high") {
      if (prevHigh) s.label = s.price > prevHigh.price ? "HH" : "LH";
      prevHigh = s;
    } else {
      if (prevLow) s.label = s.price > prevLow.price ? "HL" : "LL";
      prevLow = s;
    }
  }
  return swings;
}

/**
 * Percorre as barras em ordem; cada swing só fica "ativo" a partir da barra de confirmação.
 * Quebra por fechamento além do swing ativo; pavio além com fechamento de volta = falha.
 */
export function analyzeStructure(candles: readonly Candle[], options: StructureOptions = {}): StructureResult {
  const k = options.strength ?? EXTERNAL.strength;
  const minAtr = options.minAtr ?? EXTERNAL.minAtr;
  const swings = buildSwings(candles, { strength: k, minAtr });
  const a = atrWithWarmup(candles);
  const events: StructureEvent[] = [];
  const failed: FailedBreak[] = [];
  let trend: Direction = "neutral";
  let activeHigh: Swing | null = null;
  let activeLow: Swing | null = null;
  let highBroken = false;
  let lowBroken = false;
  // uma falha registrada por swing (vários pavios no mesmo nível contam uma vez)
  let highFailed = false;
  let lowFailed = false;
  let sIdx = 0;
  const pending = [...swings].sort((x, y) => x.confirmedAt - y.confirmedAt);

  for (let j = 0; j < candles.length; j++) {
    while (sIdx < pending.length && (pending[sIdx] as Swing).confirmedAt <= j) {
      const s = pending[sIdx] as Swing;
      if (s.kind === "high") {
        activeHigh = s;
        highBroken = false;
        highFailed = false;
      } else {
        activeLow = s;
        lowBroken = false;
        lowFailed = false;
      }
      sIdx++;
    }
    const c = candles[j] as Candle;
    const atrJ = Number.isFinite(a[j]) ? (a[j] as number) : NaN;
    const body = Math.abs(c.close - c.open);
    const disp = Number.isFinite(atrJ) && atrJ > 0 ? body / atrJ : 0;

    if (activeHigh && !highBroken && j > activeHigh.index) {
      if (c.close > activeHigh.price) {
        const type: StructureEventType = trend === "bearish" ? (disp >= 1 ? "MSS" : "CHoCH") : "BOS";
        events.push({ type, direction: "bullish", index: j, time: c.openTime, level: activeHigh.price, swingIndex: activeHigh.index, displacementAtr: disp });
        trend = "bullish";
        highBroken = true;
      } else if (c.high > activeHigh.price && !highFailed) {
        highFailed = true;
        failed.push({ type: "failed_breakout", index: j, time: c.openTime, level: activeHigh.price, swingIndex: activeHigh.index, depthAtr: Number.isFinite(atrJ) && atrJ > 0 ? (c.high - activeHigh.price) / atrJ : 0 });
      }
    }
    if (activeLow && !lowBroken && j > activeLow.index) {
      if (c.close < activeLow.price) {
        const type: StructureEventType = trend === "bullish" ? (disp >= 1 ? "MSS" : "CHoCH") : "BOS";
        events.push({ type, direction: "bearish", index: j, time: c.openTime, level: activeLow.price, swingIndex: activeLow.index, displacementAtr: disp });
        trend = "bearish";
        lowBroken = true;
      } else if (c.low < activeLow.price && !lowFailed) {
        lowFailed = true;
        failed.push({ type: "failed_breakdown", index: j, time: c.openTime, level: activeLow.price, swingIndex: activeLow.index, depthAtr: Number.isFinite(atrJ) && atrJ > 0 ? (activeLow.price - c.low) / atrJ : 0 });
      }
    }
  }

  const lastHigh = [...swings].reverse().find((s) => s.kind === "high") ?? null;
  const lastLow = [...swings].reverse().find((s) => s.kind === "low") ?? null;
  const lastClose = candles[candles.length - 1]?.close;
  let range: StructureResult["range"] = null;
  let rangePosition: number | null = null;
  let location: StructureResult["location"] = null;
  if (lastHigh && lastLow && lastHigh.price > lastLow.price && lastClose != null) {
    const hi = Math.max(lastHigh.price, lastClose);
    const lo = Math.min(lastLow.price, lastClose);
    range = { high: lastHigh.price, low: lastLow.price, equilibrium: (lastHigh.price + lastLow.price) / 2 };
    rangePosition = (lastClose - lo) / (hi - lo || 1);
    location = rangePosition > 0.55 ? "premium" : rangePosition < 0.45 ? "discount" : "equilibrium";
  }
  const lastAtr = a[a.length - 1];
  return {
    strength: k,
    minAtr,
    swings,
    events,
    failed,
    trend,
    lastEvent: events[events.length - 1] ?? null,
    lastHigh,
    lastLow,
    range,
    rangePosition,
    location,
    atr: Number.isFinite(lastAtr) ? (lastAtr as number) : NaN,
  };
}

/** Sequência dos últimos swings em texto (ex.: "HL → HH → HL"). */
export function swingSequence(swings: readonly Swing[], n = 4): string {
  return swings
    .slice(-n)
    .map((s) => s.label ?? (s.kind === "high" ? "H" : "L"))
    .join(" → ");
}
