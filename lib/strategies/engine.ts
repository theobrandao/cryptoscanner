import type { Candle } from "@/types/market";
import { analyzeStructure, EXTERNAL, INTERNAL } from "@/lib/engines/structure";
import { buildLiquidityMap } from "@/lib/engines/liquidity";
import { computeTechnicals } from "@/lib/engines/technicals";
import { classifyRegime } from "@/lib/engines/regime";
import { featureSpec, type Condition, type FeatureKey, type StrategyDefinition, type StrategyTf } from "@/lib/strategies/definition";

/**
 * Motor do Strategy Builder: calcula as features de UM timeframe a partir de candles FECHADOS e avalia
 * as condições. Puro (sem I/O) — o chamador fornece candles de cada timeframe (ao vivo ou fatiados no
 * histórico até o instante avaliado, o que torna o backtest causal).
 */
export type FeatureValue = number | string | boolean | null;
export type FeatureSet = Partial<Record<FeatureKey, FeatureValue>>;

export function computeFeatures(candles: readonly Candle[]): FeatureSet {
  const n = candles.length;
  if (n < 30) return {};
  const ext = analyzeStructure(candles, EXTERNAL);
  const int = analyzeStructure(candles, INTERNAL);
  const t = computeTechnicals(candles);
  const liq = buildLiquidityMap(candles, [...ext.swings, ...int.swings].sort((a, b) => a.index - b.index));
  const ev = ext.lastEvent;
  const last = candles[n - 1] as Candle;
  const prev = candles[n - 2];
  const bb = t.bollinger;
  const sweep = liq.recentSweeps.find((s) => s.barsAgo <= 5);
  const div = t.divergences.filter((d) => d.barsAgo <= 15).sort((a, b) => a.barsAgo - b.barsAgo)[0];
  return {
    trend: ext.trend,
    regime: classifyRegime(ext, t, n).regime,
    last_event: ev ? `${ev.type}_${ev.direction}` : "none",
    bars_since_event: ev ? n - 1 - ev.index : null,
    ema_score: t.emaScore,
    above_ema50: t.ema.e50 != null ? last.close > t.ema.e50 : null,
    above_ema200: t.ema.e200 != null ? last.close > t.ema.e200 : null,
    rsi: t.rsi,
    rsi_slope: t.rsiSlope,
    macd_hist: t.macd.histogram,
    macd_rising: t.macd.histogramRising,
    atr_pct: t.atrPct,
    atr_percentile: t.atrPercentile,
    bb_position: bb.upper != null && bb.lower != null && bb.upper > bb.lower ? (last.close - bb.lower) / (bb.upper - bb.lower) : null,
    rvol: t.rvol,
    range_position: ext.rangePosition,
    sweep: sweep ? sweep.direction : "none",
    divergence: div ? div.type : "none",
    change_pct: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
    breakout_high_20: donchian(candles, 20, "high"),
    breakout_high_55: donchian(candles, 55, "high"),
    breakout_low_20: donchian(candles, 20, "low"),
    breakout_low_55: donchian(candles, 55, "low"),
  };
}

/** Último fechamento além da máxima (mínima) dos `n` candles anteriores. null sem histórico suficiente. */
export function donchian(candles: readonly Candle[], n: number, side: "high" | "low"): boolean | null {
  const len = candles.length;
  if (len < n + 1) return null;
  const last = candles[len - 1] as Candle;
  let ext = side === "high" ? -Infinity : Infinity;
  for (let i = len - 1 - n; i < len - 1; i++) {
    const c = candles[i] as Candle;
    ext = side === "high" ? Math.max(ext, c.high) : Math.min(ext, c.low);
  }
  return side === "high" ? last.close > ext : last.close < ext;
}

export interface ConditionResult {
  condition: Condition;
  actual: FeatureValue;
  pass: boolean;
  /** dado ausente (feature null ou timeframe sem candles) — nunca conta como verdadeiro */
  missing: boolean;
}

export interface StrategyEvaluation {
  pass: boolean;
  groups: Array<{ logic: "AND" | "OR"; pass: boolean; results: ConditionResult[] }>;
  missing: string[];
}

export function compare(actual: FeatureValue, op: Condition["op"], value: Condition["value"]): boolean {
  if (actual == null) return false;
  if (typeof actual === "number" && typeof value === "number") {
    switch (op) {
      case ">":
        return actual > value;
      case ">=":
        return actual >= value;
      case "<":
        return actual < value;
      case "<=":
        return actual <= value;
      case "==":
        return actual === value;
      case "!=":
        return actual !== value;
    }
  }
  if (op === "==") return actual === value;
  if (op === "!=") return actual !== value;
  return false;
}

/** Avalia a estratégia com as features de cada timeframe (e features ao vivo opcionais). */
export function evaluateStrategy(def: StrategyDefinition, byTf: Partial<Record<StrategyTf, FeatureSet>>, live: FeatureSet = {}): StrategyEvaluation {
  const missing: string[] = [];
  const groups = def.groups.map((g) => {
    const results = g.conditions.map((c): ConditionResult => {
      const spec = featureSpec(c.feature);
      const src = spec?.liveOnly ? live : byTf[c.tf];
      const actual = src?.[c.feature] ?? null;
      const miss = actual == null;
      if (miss) missing.push(`${c.tf.toUpperCase()} ${spec?.label ?? c.feature}`);
      return { condition: c, actual, pass: !miss && compare(actual, c.op, c.value), missing: miss };
    });
    const pass = g.logic === "AND" ? results.every((r) => r.pass) : results.some((r) => r.pass);
    return { logic: g.logic, pass, results };
  });
  const pass = def.logic === "AND" ? groups.every((g) => g.pass) : groups.some((g) => g.pass);
  return { pass, groups, missing: [...new Set(missing)] };
}

/** Candles fechados do timeframe superior disponíveis no instante `t` (causal: closeTime ≤ t). */
export function sliceUntil(candles: readonly Candle[], t: number, window = 300): Candle[] {
  let hi = candles.length;
  // busca binária do primeiro candle com closeTime > t
  let lo = 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((candles[mid] as Candle).closeTime <= t) lo = mid + 1;
    else hi = mid;
  }
  return candles.slice(Math.max(0, lo - window), lo);
}

export { describeCondition } from "@/lib/strategies/definition";
