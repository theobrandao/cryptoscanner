import type { Candle } from "@/types/market";
import { analyzeStructure, EXTERNAL, INTERNAL } from "@/lib/engines/structure";
import { buildLiquidityMap } from "@/lib/engines/liquidity";
import { computeTechnicals } from "@/lib/engines/technicals";
import { buildSetupGeometry, evaluateSetup } from "@/lib/engines/setup";
import { computeConfluence } from "@/lib/engines/confluence";
import { computeMetrics, regimeSeries, resolveTrade, type BacktestTrade, type TrendRegime } from "@/lib/patterns/backtest";

/**
 * Backtest walk-forward do PRÓPRIO setup do CryptoScanner (estrutura + liquidez + zona + gatilho).
 *
 * Em cada ponto i a análise vê só candles[0..i]. Quando o setup avaliado muda para TRIGGERED no candle i,
 * registra-se uma operação: entrada no fechamento de i, stop estrutural e TP1/TP2 do setup, horizonte de
 * 40 candles, alvo e stop no mesmo candle = stop. Confluência do backtest usa só componentes calculáveis
 * no histórico (estrutura, liquidez, técnico, momentum, volume, risco) — MTF, derivativos e histórico ficam
 * fora do denominador, como no cálculo ao vivo quando indisponíveis.
 */

export interface SetupTrade extends BacktestTrade {
  confluence: number;
  tp2Hit: boolean;
}

export interface SetupBacktestResult {
  trades: SetupTrade[];
  metrics: ReturnType<typeof computeMetrics>;
  byRegime: Record<TrendRegime, ReturnType<typeof computeMetrics>>;
  tp2HitRate: number | null;
  bars: number;
  fromTime: number;
  toTime: number;
}

export interface SetupBacktestOptions {
  window?: number;
  step?: number;
  horizon?: number;
  minConfluence?: number;
}

export function backtestSetup(candles: readonly Candle[], opts: SetupBacktestOptions = {}): SetupBacktestResult {
  const { window = 220, step = 2, horizon = 40, minConfluence = 45 } = opts; // sobre a nota normalizada (ver analyzeAt)
  const regimes = regimeSeries(candles);
  const trades: SetupTrade[] = [];
  const lastEntry = candles.length - 1 - horizon;
  /** Análise completa com candles[0..t] (só passado). */
  const analyzeAt = (t: number) => {
    const w = candles.slice(Math.max(0, t + 1 - window), t + 1);
    const ext = analyzeStructure(w, EXTERNAL);
    const dir = ext.trend;
    if (dir === "neutral") return null;
    const int = analyzeStructure(w, INTERNAL);
    const liq = buildLiquidityMap(w, [...ext.swings, ...int.swings].sort((a, b) => a.index - b.index));
    const g = buildSetupGeometry(w, dir, ext, int, liq);
    if (!g) return null;
    const conf = computeConfluence({
      direction: dir,
      external: ext,
      mtf: { rows: [], alignmentScore: 0, alignment: "insufficient", summary: "" },
      liquidity: liq,
      technicals: computeTechnicals(w),
      setup: g,
      derivatives: null,
      historical: null,
      dataStatus: null,
      barsInSeries: w.length,
    });
    // No histórico MTF, derivativos e histórico não existem: a nota é normalizada pelo máximo dos
    // componentes calculáveis para o filtro e para a máquina de estados (ao vivo a nota não é normalizada).
    const availMax = conf.components.filter((c) => c.available).reduce((s, c) => s + c.max, 0);
    const score = availMax > 0 ? Math.max(0, Math.min(100, ((conf.raw + conf.penaltyTotal) / availMax) * 100)) : 0;
    return { w, dir, g, conf: { ...conf, score }, ev: evaluateSetup(w, g, int, true, score) };
  };
  const seen = new Set<number>();
  for (let i = window; i <= lastEntry; i += step) {
    const a = analyzeAt(i);
    if (!a || a.conf.score < minConfluence) continue;
    if (a.ev.state !== "TRIGGERED" && a.ev.state !== "ACTIVE") continue;
    if (a.ev.triggerIndex == null) continue;
    const t = i - (a.w.length - 1 - a.ev.triggerIndex); // índice global do gatilho
    if (seen.has(t) || t < window || t > lastEntry) continue;
    seen.add(t);
    // reavalia exatamente no candle do gatilho: geometria e nota que existiam naquele momento
    const at = analyzeAt(t);
    if (!at || at.ev.state !== "TRIGGERED" || at.conf.score < minConfluence) continue;
    const { g, dir, conf } = at;
    const entry = (candles[t] as Candle).close;
    const long = dir === "bullish";
    const tp1 = g.targets[0]?.price;
    const tp2 = g.targets[1]?.price;
    if (tp1 == null || (long ? !(g.stop < entry && tp1 > entry) : !(g.stop > entry && tp1 < entry))) continue;
    const r = resolveTrade(candles, t, dir, entry, tp1, g.stop, horizon);
    const risk = Math.abs(entry - g.stop);
    const rMult = ((long ? 1 : -1) * (r.exit - entry)) / risk;
    const mfeR = r.mfe / risk;
    trades.push({
      key: "double_bottom", // campo exigido pelo tipo base; não usado para setups
      direction: dir,
      entryIndex: t,
      entryTime: (candles[t] as Candle).openTime,
      entry,
      target: tp1,
      stop: g.stop,
      confidence: conf.score,
      confluence: conf.score,
      outcome: r.outcome,
      bars: r.bars,
      returnPct: ((long ? 1 : -1) * (r.exit - entry) * 100) / entry,
      r: rMult,
      targetR: Math.abs(tp1 - entry) / risk,
      mfeR,
      maeR: r.mae / risk,
      hit1R: mfeR >= 1,
      hit2R: mfeR >= 2,
      hit3R: mfeR >= 3,
      tp2Hit: tp2 != null && r.mfe >= Math.abs(tp2 - entry),
      regime: regimes.trend[t] ?? "range",
      volRegime: regimes.vol[t] ?? "normal",
    });
  }
  trades.sort((a, b) => a.entryIndex - b.entryIndex);
  const by = (reg: TrendRegime) => computeMetrics(trades.filter((t) => t.regime === reg));
  return {
    trades,
    metrics: computeMetrics(trades),
    byRegime: { bull: by("bull"), bear: by("bear"), range: by("range") },
    tp2HitRate: trades.length ? trades.filter((t) => t.tp2Hit).length / trades.length : null,
    bars: candles.length,
    fromTime: candles[0]?.openTime ?? 0,
    toTime: candles[candles.length - 1]?.openTime ?? 0,
  };
}
