import type { Candle, Direction } from "@/types/market";
import { detectPatterns, type DetectOptions } from "@/lib/patterns/detect";
import { PATTERN_CATALOG, type PatternKey } from "@/lib/patterns/catalog";

/**
 * Backtest walk-forward dos padrões gráficos.
 *
 * Em cada ponto `i` a detecção vê apenas candles[0..i] (sem olhar o futuro; os pivôs fractais
 * só existem depois das barras à direita). Cada padrão com alvo e stop vira uma operação teórica
 * com entrada no fechamento de `i`; percorre-se o futuro até `horizon` barras e registra-se o que
 * foi atingido primeiro. Se alvo e stop caem no mesmo candle, conta como stop (conservador).
 */

export type TradeOutcome = "win" | "loss" | "expired";

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
): { outcome: TradeOutcome; bars: number; exit: number } {
  const long = direction === "bullish";
  const end = Math.min(candles.length - 1, entryIndex + horizon);
  for (let j = entryIndex + 1; j <= end; j++) {
    const c = candles[j];
    if (!c) break;
    const hitStop = long ? c.low <= stop : c.high >= stop;
    const hitTarget = long ? c.high >= target : c.low <= target;
    if (hitStop) return { outcome: "loss", bars: j - entryIndex, exit: stop };
    if (hitTarget) return { outcome: "win", bars: j - entryIndex, exit: target };
  }
  const exitCandle = candles[end] ?? candles[entryIndex];
  return { outcome: "expired", bars: end - entryIndex, exit: exitCandle?.close ?? entry };
}

export function walkForward(candles: readonly Candle[], options: WalkForwardOptions = {}): BacktestTrade[] {
  const { lookback = 160, step = 2, horizon = 40, cooldown = 12, minConfidence = 60, pivotWindow = 3 } = options;
  const trades: BacktestTrade[] = [];
  const lastSeen = new Map<PatternKey, number>();
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
      const raw = (r.exit - entry) / entry;
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
      });
    }
  }
  return trades;
}

export function summarizeTrades(trades: readonly BacktestTrade[]): PatternStat[] {
  const byKey = new Map<PatternKey, BacktestTrade[]>();
  for (const t of trades) byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);
  const out: PatternStat[] = [];
  for (const [key, list] of byKey) {
    const wins = list.filter((t) => t.outcome === "win").length;
    const losses = list.filter((t) => t.outcome === "loss").length;
    const expired = list.length - wins - losses;
    const info = PATTERN_CATALOG[key];
    out.push({
      key,
      label: info.label,
      direction: info.direction,
      samples: list.length,
      wins,
      losses,
      expired,
      hitRate: wins + losses > 0 ? wins / (wins + losses) : null,
      avgReturnPct: list.length ? list.reduce((s, t) => s + t.returnPct, 0) / list.length : null,
      avgBars: list.length ? list.reduce((s, t) => s + t.bars, 0) / list.length : null,
    });
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
