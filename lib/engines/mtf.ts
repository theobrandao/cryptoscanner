import type { Candle, Direction, Timeframe } from "@/types/market";
import { atr, ema, rsi } from "@/lib/indicators/core";
import { analyzeStructure, EXTERNAL, swingSequence, type StructureEvent } from "@/lib/engines/structure";

/**
 * Multi-Timeframe Engine: análise hierárquica do TF superior para o inferior.
 * 1W direção macro → 1D tendência principal → 4H estrutura operacional → 1H setup → 30m/15m gatilho.
 */

export const MTF_ORDER = ["1w", "1d", "4h", "1h", "30m", "15m"] as const satisfies readonly Timeframe[];
export type MtfTimeframe = (typeof MTF_ORDER)[number];

/** Peso de cada TF no HTF alignment score (soma 1). */
export const MTF_WEIGHTS: Record<MtfTimeframe, number> = { "1w": 0.3, "1d": 0.3, "4h": 0.2, "1h": 0.12, "30m": 0.04, "15m": 0.04 };

export const MTF_ROLE: Record<MtfTimeframe, string> = {
  "1w": "direção macro",
  "1d": "tendência principal",
  "4h": "estrutura operacional",
  "1h": "setup",
  "30m": "gatilho",
  "15m": "gatilho",
};

export type Phase = "tendência" | "pullback" | "reversão" | "lateral";

export interface MtfRow {
  timeframe: MtfTimeframe;
  role: string;
  /** tendência pela estrutura externa (BOS/CHoCH) */
  structure: Direction;
  sequence: string;
  lastEvent: Pick<StructureEvent, "type" | "direction" | "level" | "time"> | null;
  /** alinhamento das EMAs 21/50/200 com o preço: −100..100 */
  emaScore: number;
  rsi: number;
  location: "premium" | "discount" | "equilibrium" | null;
  atrPct: number;
  /** leitura combinada: tendência a favor, pullback (estrutura a favor, preço contra EMAs curtas), reversão (CHoCH/MSS recente) */
  phase: Phase;
  /** direção usada no score: estrutura; se neutra, sinal do emaScore forte (|≥60|) */
  bias: Direction;
  candles: number;
}

export interface MtfResult {
  rows: MtfRow[];
  /** −100 (todos baixistas) … +100 (todos altistas), ponderado por MTF_WEIGHTS sobre os TFs disponíveis */
  alignmentScore: number;
  alignment: "aligned_bull" | "aligned_bear" | "mixed" | "insufficient";
  summary: string;
}

function lastFinite(v: readonly number[]): number {
  for (let i = v.length - 1; i >= 0; i--) if (Number.isFinite(v[i])) return v[i] as number;
  return NaN;
}

/** EMA trend score: preço e EMAs em ordem (preço > EMA21 > EMA50 > EMA200) e inclinação da EMA50. */
export function emaTrendScore(candles: readonly Candle[]): number {
  const closes = candles.map((c) => c.close);
  const p = closes[closes.length - 1];
  if (p == null) return 0;
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const a = lastFinite(e21);
  const b = lastFinite(e50);
  const c = lastFinite(e200);
  let score = 0;
  const cmp = (x: number, y: number, w: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    score += x > y ? w : x < y ? -w : 0;
  };
  cmp(p, a, 20);
  cmp(a, b, 20);
  cmp(b, c, 25);
  cmp(p, c, 15);
  const b10 = e50[e50.length - 11];
  if (Number.isFinite(b) && b10 != null && Number.isFinite(b10)) score += b > b10 ? 20 : b < b10 ? -20 : 0;
  return Math.max(-100, Math.min(100, score));
}

export function analyzeTimeframe(tf: MtfTimeframe, candles: readonly Candle[]): MtfRow {
  const st = analyzeStructure(candles, EXTERNAL);
  const emaScore = emaTrendScore(candles);
  const r = lastFinite(rsi(candles.map((c) => c.close), 14));
  const a = lastFinite(atr(candles, 14));
  const close = candles[candles.length - 1]?.close ?? NaN;
  const recentBars = 12;
  const ev = st.lastEvent;
  const recentReversal = ev != null && (ev.type === "CHoCH" || ev.type === "MSS") && candles.length - 1 - ev.index <= recentBars;
  let phase: Phase = "lateral";
  if (recentReversal) phase = "reversão";
  else if (st.trend !== "neutral") {
    const withTrend = st.trend === "bullish" ? emaScore > 0 : emaScore < 0;
    phase = withTrend ? "tendência" : "pullback";
  }
  const bias: Direction = st.trend !== "neutral" ? st.trend : emaScore >= 60 ? "bullish" : emaScore <= -60 ? "bearish" : "neutral";
  return {
    timeframe: tf,
    role: MTF_ROLE[tf],
    structure: st.trend,
    sequence: swingSequence(st.swings),
    lastEvent: ev ? { type: ev.type, direction: ev.direction, level: ev.level, time: ev.time } : null,
    emaScore,
    rsi: r,
    location: st.location,
    atrPct: Number.isFinite(a) && close > 0 ? (a / close) * 100 : NaN,
    phase,
    bias,
    candles: candles.length,
  };
}

export function analyzeMtf(series: Partial<Record<MtfTimeframe, readonly Candle[]>>): MtfResult {
  const rows: MtfRow[] = [];
  for (const tf of MTF_ORDER) {
    const cs = series[tf];
    if (cs && cs.length >= 60) rows.push(analyzeTimeframe(tf, cs));
  }
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const w = MTF_WEIGHTS[r.timeframe];
    den += w;
    num += w * (r.bias === "bullish" ? 1 : r.bias === "bearish" ? -1 : 0);
  }
  const alignmentScore = den > 0 ? Math.round((num / den) * 100) : 0;
  const alignment: MtfResult["alignment"] = rows.length < 3 ? "insufficient" : alignmentScore >= 60 ? "aligned_bull" : alignmentScore <= -60 ? "aligned_bear" : "mixed";
  const dir = (d: Direction) => (d === "bullish" ? "alta" : d === "bearish" ? "baixa" : "neutro");
  const summary = rows.map((r) => `${r.timeframe.toUpperCase()} ${dir(r.bias)}${r.phase !== "tendência" ? ` (${r.phase})` : ""}`).join(" · ");
  return { rows, alignmentScore, alignment, summary };
}
