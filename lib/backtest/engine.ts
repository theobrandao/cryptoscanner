import type { Candle, Direction } from "@/types/market";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import { analyzeStructure, EXTERNAL } from "@/lib/engines/structure";
import { atr } from "@/lib/indicators/core";
import { computeMetrics, regimeSeries, resolveTrade, type BacktestTrade, type TrendRegime } from "@/lib/patterns/backtest";
import { executionTf, timeframesOf, type StrategyDefinition, type StrategyTf } from "@/lib/strategies/definition";
import { computeFeatures, evaluateStrategy, sliceUntil, type FeatureSet } from "@/lib/strategies/engine";
import type { Timeframe } from "@/types/market";

/**
 * Backtest com custos — puro e causal.
 *
 *   entrada  = fechamento do candle do sinal + `entryDelay` candles (0 = no próprio fechamento)
 *   custos   = taxa por lado (bps do notional) + slippage por lado (bps, sempre contra) + funding do
 *              perpétuo pró-rata ao tempo em posição (taxa positiva: long paga, short recebe)
 *   R        = resultado ÷ risco planejado (|entrada − stop| sem custos) → custos reduzem o R
 *   resolução: alvo e stop no mesmo candle = stop (conservador); expira no fechamento do horizonte
 *   capital  = composto: equity × (1 + risco% × R líquido)
 */
export interface CostModel {
  feeBps: number;
  slippageBps: number;
  /** funding por 8 h em % (ex.: 0.01) — só perpétuo */
  fundingPct8h: number;
  entryDelay: number;
  perp: boolean;
  riskPct: number;
}

export const DEFAULT_COSTS: CostModel = { feeBps: 10, slippageBps: 5, fundingPct8h: 0.01, entryDelay: 0, perp: false, riskPct: 1 };

export interface Signal {
  index: number;
  direction: Exclude<Direction, "neutral">;
  stop: number;
  /** NaN quando a saída é por trailing (sem alvo) */
  target: number;
  horizon: number;
  /** saída por stop móvel: mínima (máxima, no short) dos últimos `trailN` candles, atualizada no fechamento */
  trailN?: number;
}

/**
 * Saída por trailing: stop inicial → a cada fechamento o stop sobe (long) para a mínima dos últimos `trailN`
 * candles, valendo a partir do candle seguinte. Gap além do stop sai na abertura (pior preço). Horizonte = teto.
 */
export function resolveTrailing(candles: readonly Candle[], entryIndex: number, direction: Exclude<Direction, "neutral">, entry: number, stop0: number, trailN: number, horizon: number) {
  const long = direction === "bullish";
  const end = Math.min(candles.length - 1, entryIndex + horizon);
  let stop = stop0;
  let mfe = 0;
  let mae = 0;
  for (let j = entryIndex + 1; j <= end; j++) {
    const c = candles[j] as Candle;
    if (long ? c.low <= stop : c.high >= stop) {
      const exit = long ? Math.min(stop, c.open) : Math.max(stop, c.open);
      mae = Math.max(mae, long ? entry - exit : exit - entry);
      const pnl = long ? exit - entry : entry - exit;
      return { outcome: pnl > 0 ? ("win" as const) : ("loss" as const), bars: j - entryIndex, exit, mfe, mae: Math.max(0, mae), stop };
    }
    mfe = Math.max(mfe, long ? c.high - entry : entry - c.low);
    mae = Math.max(mae, long ? entry - c.low : c.high - entry);
    let ext = long ? Infinity : -Infinity;
    for (let q = Math.max(0, j - trailN + 1); q <= j; q++) {
      const x = candles[q] as Candle;
      ext = long ? Math.min(ext, x.low) : Math.max(ext, x.high);
    }
    stop = long ? Math.max(stop, ext) : Math.min(stop, ext);
  }
  const last = candles[end] ?? candles[entryIndex];
  return { outcome: "expired" as const, bars: end - entryIndex, exit: last?.close ?? entry, mfe, mae: Math.max(0, mae), stop };
}

export interface BtTrade {
  entryIndex: number;
  entryTime: number;
  exitTime: number;
  direction: Exclude<Direction, "neutral">;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  outcome: "win" | "loss" | "expired";
  bars: number;
  rGross: number;
  rNet: number;
  costR: number;
  mfeR: number;
  maeR: number;
  /** excursão a favor até o stop ou o horizonte, sem sair no alvo (base do Hit 1R/2R/3R) */
  runR: number;
  regime: TrendRegime;
  /** trailing: nível do stop móvel na saída (ou no último candle, se a posição segue aberta) */
  trailStop?: number;
}

export interface EquityPoint {
  time: number;
  r: number;
  equityPct: number;
  drawdownPct: number;
}

export interface BtResult {
  trades: BtTrade[];
  metrics: ReturnType<typeof computeMetrics>;
  grossExpectancyR: number | null;
  equity: EquityPoint[];
  finalReturnPct: number;
  maxDrawdownPct: number;
  buyHoldPct: number | null;
  exposurePct: number;
  totalCostR: number;
  byRegime: Record<TrendRegime, { samples: number; expectancyR: number | null }>;
  fromTime: number;
  toTime: number;
  bars: number;
}

/** Executa sinais com custos. Uma posição por vez; sinal durante posição aberta é ignorado. */
export function runSignals(candles: readonly Candle[], signals: readonly Signal[], tf: Timeframe, costs: CostModel, startIndex = 0): BtResult {
  const regimes = regimeSeries(candles);
  const trades: BtTrade[] = [];
  let busyUntil = -1;
  const fee = costs.feeBps / 10_000;
  const slip = costs.slippageBps / 10_000;
  const hoursPerBar = TIMEFRAME_MS[tf] / 3_600_000;
  for (const s of [...signals].sort((a, b) => a.index - b.index)) {
    const ei = s.index + Math.max(0, costs.entryDelay);
    if (ei <= busyUntil || ei >= candles.length - 1) continue;
    const long = s.direction === "bullish";
    const entry = (candles[ei] as Candle).close;
    const trail = s.trailN != null && s.trailN > 0;
    // atraso pode levar o preço além do stop/alvo planejados: descarta (não entra em sinal vencido)
    if (long ? !(s.stop < entry && (trail || s.target > entry)) : !(s.stop > entry && (trail || s.target < entry))) continue;
    const risk = Math.abs(entry - s.stop);
    if (!(risk > 0)) continue;
    const r = trail ? resolveTrailing(candles, ei, s.direction, entry, s.stop, s.trailN as number, s.horizon) : resolveTrade(candles, ei, s.direction, entry, s.target, s.stop, s.horizon);
    const sign = long ? 1 : -1;
    const gross = sign * (r.exit - entry);
    const entryFill = entry * (1 + sign * slip);
    const exitFill = r.exit * (1 - sign * slip);
    const feeCost = fee * (entryFill + exitFill);
    const fundingCost = costs.perp ? entry * (costs.fundingPct8h / 100) * ((r.bars * hoursPerBar) / 8) * sign : 0;
    const net = sign * (exitFill - entryFill) - feeCost - fundingCost;
    // trailing: a excursão até a saída já é o "run" (o stop móvel é a própria saída)
    let runR = trail ? r.mfe / risk : 0;
    for (let j = ei + 1; !trail && j <= Math.min(candles.length - 1, ei + s.horizon); j++) {
      const c = candles[j] as Candle;
      if (long ? c.low <= s.stop : c.high >= s.stop) break;
      runR = Math.max(runR, (long ? c.high - entry : entry - c.low) / risk);
    }
    trades.push({
      entryIndex: ei,
      entryTime: (candles[ei] as Candle).openTime,
      exitTime: (candles[Math.min(candles.length - 1, ei + r.bars)] as Candle).closeTime,
      direction: s.direction,
      entry,
      exit: r.exit,
      stop: s.stop,
      target: s.target,
      outcome: r.outcome,
      bars: r.bars,
      rGross: gross / risk,
      rNet: net / risk,
      costR: (gross - net) / risk,
      mfeR: r.mfe / risk,
      maeR: r.mae / risk,
      runR,
      regime: regimes.trend[ei] ?? "range",
      ...(trail && "stop" in r ? { trailStop: r.stop as number } : {}),
    });
    busyUntil = ei + r.bars;
  }
  const asBase = (t: BtTrade, r: number): BacktestTrade => ({
    key: "double_bottom",
    direction: t.direction,
    entryIndex: t.entryIndex,
    entryTime: t.entryTime,
    entry: t.entry,
    target: t.target,
    stop: t.stop,
    confidence: 0,
    outcome: t.outcome,
    bars: t.bars,
    returnPct: ((t.direction === "bullish" ? 1 : -1) * (t.exit - t.entry) * 100) / t.entry,
    r,
    targetR: Number.isFinite(t.target) ? Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop) : 0,
    mfeR: t.mfeR,
    maeR: t.maeR,
    hit1R: t.runR >= 1,
    hit2R: t.runR >= 2,
    hit3R: t.runR >= 3,
    regime: t.regime,
    volRegime: "normal",
  });
  const metrics = computeMetrics(trades.map((t) => asBase(t, t.rNet)));
  const gross = computeMetrics(trades.map((t) => asBase(t, t.rGross)));
  let eq = 100;
  let peak = 100;
  let maxDd = 0;
  let cumR = 0;
  const first = candles[startIndex] ?? candles[0];
  const equity: EquityPoint[] = first ? [{ time: first.openTime, r: 0, equityPct: 0, drawdownPct: 0 }] : [];
  for (const t of trades) {
    cumR += t.rNet;
    eq *= 1 + (costs.riskPct / 100) * t.rNet;
    peak = Math.max(peak, eq);
    const dd = ((peak - eq) / peak) * 100;
    maxDd = Math.max(maxDd, dd);
    equity.push({ time: t.exitTime, r: cumR, equityPct: eq - 100, drawdownPct: -dd });
  }
  const last = candles[candles.length - 1];
  const by = (reg: TrendRegime) => {
    const m = computeMetrics(trades.filter((t) => t.regime === reg).map((t) => asBase(t, t.rNet)));
    return { samples: m.samples, expectancyR: m.expectancyR };
  };
  const barsInMarket = trades.reduce((s, t) => s + t.bars, 0);
  const span = Math.max(1, candles.length - 1 - startIndex);
  return {
    trades,
    metrics,
    grossExpectancyR: gross.expectancyR,
    equity,
    finalReturnPct: eq - 100,
    maxDrawdownPct: maxDd,
    buyHoldPct: first && last ? ((last.close - first.close) / first.close) * 100 : null,
    exposurePct: (barsInMarket / span) * 100,
    totalCostR: trades.reduce((s, t) => s + t.costR, 0),
    byRegime: { bull: by("bull"), bear: by("bear"), range: by("range") },
    fromTime: first?.openTime ?? 0,
    toTime: last?.openTime ?? 0,
    bars: span,
  };
}

/**
 * Sinais de uma estratégia sobre o histórico. Em cada candle `t` do timeframe de execução, as features de
 * cada timeframe usam só candles com closeTime ≤ closeTime(t) (causal). Sinal = transição falso → verdadeiro.
 */
export function strategySignals(def: StrategyDefinition, exec: readonly Candle[], htf: Partial<Record<StrategyTf, readonly Candle[]>>, warmup = 200, window = 300): Signal[] {
  const et = executionTf(def);
  const tfs = timeframesOf(def).filter((t) => t !== et);
  const atrs = atr(exec, 14);
  const signals: Signal[] = [];
  const htfCache = new Map<string, FeatureSet>();
  let prev = false;
  const dir = def.direction === "long" ? "bullish" : "bearish";
  for (let t = warmup; t < exec.length; t++) {
    const c = exec[t] as Candle;
    const byTf: Partial<Record<StrategyTf, FeatureSet>> = { [et]: computeFeatures(exec.slice(Math.max(0, t + 1 - window), t + 1)) };
    for (const tf of tfs) {
      const src = htf[tf];
      if (!src) continue;
      const sl = sliceUntil(src, c.closeTime, window);
      const k = `${tf}:${sl.length ? (sl[sl.length - 1] as Candle).openTime : 0}`;
      let f = htfCache.get(k);
      if (!f) {
        f = computeFeatures(sl);
        htfCache.set(k, f);
      }
      byTf[tf] = f;
    }
    const pass = evaluateStrategy(def, byTf).pass;
    if (pass && !prev) {
      const a = atrs[t];
      const long = dir === "bullish";
      let stop = Number.isFinite(a) ? c.close - (long ? 1 : -1) * def.exit.atrMult * (a as number) : NaN;
      if (def.exit.stop === "structure") {
        const ext = analyzeStructure(exec.slice(Math.max(0, t + 1 - window), t + 1), EXTERNAL);
        const sw = long ? ext.lastLow?.price : ext.lastHigh?.price;
        if (sw != null && (long ? sw < c.close : sw > c.close)) stop = sw - (long ? 1 : -1) * 0.1 * (Number.isFinite(a) ? (a as number) : 0);
      }
      if (Number.isFinite(stop)) {
        const risk = Math.abs(c.close - stop);
        if (def.exit.mode === "trail") signals.push({ index: t, direction: dir, stop, target: NaN, horizon: def.exit.horizon, trailN: def.exit.trailN });
        else signals.push({ index: t, direction: dir, stop, target: c.close + (long ? 1 : -1) * def.exit.rr * risk, horizon: def.exit.horizon });
      }
    }
    prev = pass;
  }
  return signals;
}
