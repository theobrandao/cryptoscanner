import type { Candle, Direction } from "@/types/market";
import { atr, ema } from "@/lib/indicators/core";
import { detectPatterns, type DetectOptions } from "@/lib/patterns/detect";
import { PATTERN_CATALOG, type PatternKey } from "@/lib/patterns/catalog";

/**
 * Backtest walk-forward dos padrões gráficos.
 *
 * Em cada ponto `i` a detecção vê apenas candles[0..i] (sem olhar o futuro; os pivôs fractais
 * só existem depois das barras à direita). Cada padrão com alvo e stop vira uma operação teórica
 * com entrada no fechamento de `i`; percorre-se o futuro até `horizon` barras e registra-se o que
 * foi atingido primeiro. Se alvo e stop caem no mesmo candle, conta como stop (conservador).
 *
 * Métricas em R (1R = |entrada − stop|): resultado, MFE/MAE (excursão máxima a favor/contra antes da
 * saída), e se 1R/2R/3R foram alcançados antes do stop. Regime na entrada calculado só com o passado.
 * Sem custos de corretagem/slippage.
 */

export type TradeOutcome = "win" | "loss" | "expired";
export type TrendRegime = "bull" | "bear" | "range";
export type VolRegime = "low" | "normal" | "high";

export interface BacktestTrade {
  key: PatternKey;
  direction: Direction;
  entryIndex: number;
  entryTime: number;
  entry: number;
  target: number;
  stop: number;
  confidence: number;
  outcome: TradeOutcome;
  bars: number;
  /** retorno percentual da operação teórica, já com o sinal da direção (short positivo quando cai) */
  returnPct: number;
  /** resultado em R */
  r: number;
  /** alvo do padrão em R */
  targetR: number;
  mfeR: number;
  maeR: number;
  hit1R: boolean;
  hit2R: boolean;
  hit3R: boolean;
  regime: TrendRegime;
  volRegime: VolRegime;
}

export interface WalkForwardOptions extends Pick<DetectOptions, "pivotWindow" | "minConfidence"> {
  /** janela de candles vista pelo detector em cada ponto */
  lookback?: number;
  /** avanço entre avaliações (1 = todo candle) */
  step?: number;
  /** barras máximas para alvo/stop; depois disso a operação expira no fechamento */
  horizon?: number;
  /** barras mínimas entre dois registros do mesmo padrão (evita contar a mesma formação várias vezes) */
  cooldown?: number;
}

export interface PatternStat {
  key: PatternKey;
  label: string;
  direction: Direction;
  samples: number;
  wins: number;
  losses: number;
  expired: number;
  /** wins / (wins + losses); null sem operações resolvidas */
  hitRate: number | null;
  avgReturnPct: number | null;
  avgBars: number | null;
  /** métricas em R (null sem amostra) */
  hit1R: number | null;
  hit2R: number | null;
  hit3R: number | null;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  /** expectativa por operação em R = média dos resultados em R */
  expectancyR: number | null;
  /** soma dos R positivos / |soma dos R negativos| */
  profitFactor: number | null;
  /** maior queda acumulada em R na sequência cronológica das operações */
  maxDrawdownR: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  /** média / desvio-padrão dos R por operação (não anualizado) */
  sharpe: number | null;
}

export interface ResolvedTrade {
  outcome: TradeOutcome;
  bars: number;
  exit: number;
  /** excursões máximas a favor/contra (em preço, positivas) até a saída */
  mfe: number;
  mae: number;
}

/** Resolve uma operação a partir do candle seguinte à entrada. */
export function resolveTrade(
  candles: readonly Candle[],
  entryIndex: number,
  direction: Direction,
  entry: number,
  target: number,
  stop: number,
  horizon: number,
): ResolvedTrade {
  const long = direction === "bullish";
  const end = Math.min(candles.length - 1, entryIndex + horizon);
  let mfe = 0;
  let mae = 0;
  for (let j = entryIndex + 1; j <= end; j++) {
    const c = candles[j];
    if (!c) break;
    const fav = long ? c.high - entry : entry - c.low;
    const adv = long ? entry - c.low : c.high - entry;
    const hitStop = long ? c.low <= stop : c.high >= stop;
    const hitTarget = long ? c.high >= target : c.low <= target;
    if (hitStop) {
      mae = Math.max(mae, Math.abs(entry - stop));
      // no candle do stop, a excursão a favor pode ter ocorrido antes: conservador → não conta
      return { outcome: "loss", bars: j - entryIndex, exit: stop, mfe, mae };
    }
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);
    if (hitTarget) return { outcome: "win", bars: j - entryIndex, exit: target, mfe: Math.max(mfe, Math.abs(target - entry)), mae };
  }
  const exitCandle = candles[end] ?? candles[entryIndex];
  return { outcome: "expired", bars: end - entryIndex, exit: exitCandle?.close ?? entry, mfe, mae };
}

/** Regime na barra i usando só o passado: tendência (EMA50/EMA200) e volatilidade (percentil do ATR% em 100 barras). */
export function regimeSeries(candles: readonly Candle[]): { trend: TrendRegime[]; vol: VolRegime[] } {
  const closes = candles.map((c) => c.close);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const a = atr(candles, 14);
  const atrPct = a.map((v, i) => (Number.isFinite(v) ? (v as number) / (closes[i] as number) : NaN));
  const trend: TrendRegime[] = [];
  const vol: VolRegime[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = closes[i] as number;
    const slow = Number.isFinite(e200[i]) ? (e200[i] as number) : NaN;
    const mid = e50[i] as number;
    const prevMid = e50[i - 10];
    const slope = Number.isFinite(mid) && prevMid != null && Number.isFinite(prevMid) ? mid - prevMid : NaN;
    // sem EMA200 (histórico curto), usa a EMA50 como referência de tendência
    const ref = Number.isFinite(slow) ? slow : mid;
    if (Number.isFinite(ref) && Number.isFinite(slope) && c > ref && slope > 0) trend.push("bull");
    else if (Number.isFinite(ref) && Number.isFinite(slope) && c < ref && slope < 0) trend.push("bear");
    else trend.push("range");
    const window = atrPct.slice(Math.max(0, i - 99), i + 1).filter((v) => Number.isFinite(v));
    const cur = atrPct[i];
    if (!Number.isFinite(cur) || window.length < 20) {
      vol.push("normal");
      continue;
    }
    const below = window.filter((v) => v < (cur as number)).length / window.length;
    vol.push(below >= 0.8 ? "high" : below <= 0.2 ? "low" : "normal");
  }
  return { trend, vol };
}

export function walkForward(candles: readonly Candle[], options: WalkForwardOptions = {}): BacktestTrade[] {
  const { lookback = 160, step = 2, horizon = 40, cooldown = 12, minConfidence = 60, pivotWindow = 3 } = options;
  const trades: BacktestTrade[] = [];
  const lastSeen = new Map<PatternKey, number>();
  const regimes = regimeSeries(candles);
  // só avalia pontos que têm `horizon` barras à frente: operação ainda aberta não entra na estatística
  const lastEntry = candles.length - 1 - horizon;
  for (let i = Math.max(lookback, 60) - 1; i <= lastEntry; i += step) {
    const window = candles.slice(Math.max(0, i + 1 - lookback), i + 1);
    const matches = detectPatterns(window, { lookback, minConfidence, pivotWindow });
    for (const m of matches) {
      if (m.direction === "neutral" || m.target == null || m.stop == null) continue;
      const prev = lastSeen.get(m.key);
      if (prev != null && i - prev < cooldown) continue;
      const entry = candles[i]?.close ?? m.price;
      const long = m.direction === "bullish";
      // geometria inválida no momento da entrada (alvo já atingido ou stop do lado errado)
      if (long ? !(m.target > entry && m.stop < entry) : !(m.target < entry && m.stop > entry)) continue;
      lastSeen.set(m.key, i);
      const r = resolveTrade(candles, i, m.direction, entry, m.target, m.stop, horizon);
      const risk = Math.abs(entry - m.stop);
      const raw = (r.exit - entry) / entry;
      const rMult = ((long ? 1 : -1) * (r.exit - entry)) / risk;
      const mfeR = r.mfe / risk;
      trades.push({
        key: m.key,
        direction: m.direction,
        entryIndex: i,
        entryTime: candles[i]?.openTime ?? 0,
        entry,
        target: m.target,
        stop: m.stop,
        confidence: m.confidence,
        outcome: r.outcome,
        bars: r.bars,
        returnPct: (long ? raw : -raw) * 100,
        r: rMult,
        targetR: Math.abs(m.target - entry) / risk,
        mfeR,
        maeR: r.mae / risk,
        hit1R: mfeR >= 1,
        hit2R: mfeR >= 2,
        hit3R: mfeR >= 3,
        regime: regimes.trend[i] ?? "range",
        volRegime: regimes.vol[i] ?? "normal",
      });
    }
  }
  return trades;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Métricas de um conjunto de operações (ordem cronológica para o drawdown). */
export function computeMetrics(list: readonly BacktestTrade[]): Omit<PatternStat, "key" | "label" | "direction"> {
  const wins = list.filter((t) => t.outcome === "win").length;
  const losses = list.filter((t) => t.outcome === "loss").length;
  const rs = list.map((t) => t.r);
  const pos = rs.filter((r) => r > 0);
  const neg = rs.filter((r) => r < 0);
  const sumPos = pos.reduce((s, x) => s + x, 0);
  const sumNeg = Math.abs(neg.reduce((s, x) => s + x, 0));
  const ordered = [...list].sort((a, b) => a.entryTime - b.entryTime);
  let eq = 0;
  let peak = 0;
  let dd = 0;
  for (const t of ordered) {
    eq += t.r;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  const m = mean(rs);
  const sd = rs.length > 1 && m != null ? Math.sqrt(rs.reduce((s, x) => s + (x - m) ** 2, 0) / (rs.length - 1)) : null;
  const n = list.length;
  return {
    samples: n,
    wins,
    losses,
    expired: n - wins - losses,
    hitRate: wins + losses > 0 ? wins / (wins + losses) : null,
    avgReturnPct: mean(list.map((t) => t.returnPct)),
    avgBars: mean(list.map((t) => t.bars)),
    hit1R: n ? list.filter((t) => t.hit1R).length / n : null,
    hit2R: n ? list.filter((t) => t.hit2R).length / n : null,
    hit3R: n ? list.filter((t) => t.hit3R).length / n : null,
    avgR: m,
    avgWinR: mean(pos),
    avgLossR: mean(neg),
    expectancyR: m,
    profitFactor: sumNeg > 0 ? sumPos / sumNeg : sumPos > 0 ? Infinity : null,
    maxDrawdownR: n ? dd : null,
    avgMfeR: mean(list.map((t) => t.mfeR)),
    avgMaeR: mean(list.map((t) => t.maeR)),
    sharpe: sd && sd > 0 && m != null ? m / sd : null,
  };
}

export function summarizeTrades(trades: readonly BacktestTrade[]): PatternStat[] {
  const byKey = new Map<PatternKey, BacktestTrade[]>();
  for (const t of trades) byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);
  const out: PatternStat[] = [];
  for (const [key, list] of byKey) {
    const info = PATTERN_CATALOG[key];
    out.push({ key, label: info.label, direction: info.direction, ...computeMetrics(list) });
  }
  return out.sort((a, b) => b.samples - a.samples);
}

/** Intervalo de confiança de Wilson (95%) para a taxa de acerto — evita ler 2/2 como 100%. */
export function wilsonInterval(wins: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}
