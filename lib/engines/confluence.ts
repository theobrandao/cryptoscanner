import type { Direction } from "@/types/market";
import type { StructureResult } from "@/lib/engines/structure";
import type { LiquidityMap } from "@/lib/engines/liquidity";
import type { MtfResult } from "@/lib/engines/mtf";
import type { Technicals } from "@/lib/engines/technicals";
import type { SetupGeometry } from "@/lib/engines/setup";
import type { DataStatus } from "@/lib/engines/quality";
import { candlesAgo, dec, POOL_KIND_PT, pt } from "@/lib/display-labels";

/**
 * Confluence Score (R2) — nota 0–100 de QUALIDADE/CONFLUÊNCIA. Não é probabilidade.
 *
 *   componente_i ∈ [0, máx_i]   (evidência a favor)          Σ máx_i = 100
 *   raw          = Σ componente_i
 *   penalidades  ≤ 0            (evidência contra, listada item a item)
 *   final        = clamp(raw + Σ penalidades, 0, 100)
 *
 * Componente sem dado (ex.: derivativos em SPOT, histórico com amostra pequena) vale 0 e é marcado
 * "n/d" — conservador: falta de dado nunca soma pontos. A conta fecha: final = raw + penalidades.
 */

export type ComponentKey = "structure" | "liquidity" | "htf" | "volume" | "momentum" | "derivatives" | "historical" | "risk";

export const DEFAULT_WEIGHTS: Record<ComponentKey, number> = {
  structure: 20,
  liquidity: 15,
  htf: 15,
  volume: 10,
  momentum: 10,
  derivatives: 10,
  historical: 10,
  risk: 10,
};

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  structure: "Estrutura",
  liquidity: "Liquidez",
  htf: "Tendência maior (HTF)",
  volume: "Volume",
  momentum: "Momento",
  derivatives: "Derivativos",
  historical: "Histórico",
  risk: "Qualidade do risco",
};

export interface ConfluenceComponent {
  key: ComponentKey;
  label: string;
  score: number;
  max: number;
  available: boolean;
  reasons: string[];
}

export interface ConfluencePenalty {
  label: string;
  points: number;
}

export type Verdict = "TRADE_CANDIDATE" | "WATCH" | "NO_TRADE";
export type ScoreLabel = "Low" | "Moderate" | "Good" | "Strong" | "Exceptional";

export interface ConfluenceResult {
  direction: Direction;
  raw: number;
  penaltyTotal: number;
  score: number;
  components: ConfluenceComponent[];
  penalties: ConfluencePenalty[];
  verdict: Verdict;
  noTradeReasons: string[];
  label: ScoreLabel;
  /** estado visual quando não há setup operável */
  condition: "OK" | "NO_SETUP" | "NEUTRAL" | "LOW_CONFLUENCE" | "CONFLICTING_TIMEFRAMES" | "DATA_UNAVAILABLE";
}

export interface DerivativesInput {
  fundingRate: number | null;
  openInterestChange24hPct: number | null;
  priceChange24hPct: number | null;
  longShortRatio: number | null;
}

export interface HistoricalInput {
  expectancyR: number | null;
  samples: number;
  minSample: number;
}

export interface ConfluenceInput {
  direction: Direction;
  external: StructureResult;
  mtf: MtfResult;
  liquidity: LiquidityMap;
  technicals: Technicals;
  setup: SetupGeometry | null;
  derivatives: DerivativesInput | null;
  historical: HistoricalInput | null;
  dataStatus: DataStatus | null;
  barsInSeries: number;
  weights?: Partial<Record<ComponentKey, number>>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 90) return "Exceptional";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Moderate";
  return "Low";
}

export function computeConfluence(i: ConfluenceInput): ConfluenceResult {
  const W = { ...DEFAULT_WEIGHTS, ...(i.weights ?? {}) };
  const comps: ConfluenceComponent[] = [];
  const penalties: ConfluencePenalty[] = [];
  const noTrade: string[] = [];
  const d = i.direction;
  if (d === "neutral") {
    return {
      direction: d,
      raw: 0,
      penaltyTotal: 0,
      score: 0,
      components: (Object.keys(W) as ComponentKey[]).map((k) => ({ key: k, label: COMPONENT_LABEL[k], score: 0, max: W[k], available: false, reasons: ["sem direção definida"] })),
      penalties: [],
      verdict: "NO_TRADE",
      noTradeReasons: ["Sem direção: estrutura externa e multi-timeframe neutras"],
      label: "Low",
      condition: "NEUTRAL",
    };
  }
  const sg = d === "bullish" ? 1 : -1;
  const add = (key: ComponentKey, raw: number, reasons: string[], available = true) => {
    comps.push({ key, label: COMPONENT_LABEL[key], score: available ? r1(clamp(raw, 0, W[key])) : 0, max: W[key], available, reasons });
  };
  const pen = (label: string, points: number) => penalties.push({ label, points });

  // Market Structure (20): tendência externa a favor 60%; evento recente a favor 40% (BOS) / 30% (CHoCH/MSS)
  {
    const m = W.structure;
    const r: string[] = [];
    let v = 0;
    if (i.external.trend === d) {
      v += 0.6 * m;
      r.push(`estrutura externa ${d === "bullish" ? "altista" : "baixista"}`);
    } else if (i.external.trend !== "neutral") {
      r.push("estrutura externa contra a direção");
      pen("Estrutura externa contra", -4);
    }
    const ev = i.external.lastEvent;
    if (ev && i.barsInSeries - 1 - ev.index <= 30) {
      const ago = i.barsInSeries - 1 - ev.index;
      if (ev.direction === d) {
        v += (ev.type === "BOS" ? 0.4 : 0.3) * m;
        r.push(`${ev.type} a favor há ${ago} candles`);
      } else r.push(`${ev.type} contra há ${ago} candles`);
    }
    add("structure", v, r);
  }

  // Liquidity (15): varredura a favor 8, liquidez-alvo à frente ≤ 3 ATR 4, zona apoiada em liquidez/swing 3
  {
    const r: string[] = [];
    let v = 0;
    const sweep = i.liquidity.recentSweeps.find((s) => s.direction === d);
    if (sweep) {
      v += 8;
      r.push(`varredura de ${pt(POOL_KIND_PT, sweep.kind)} ${candlesAgo(sweep.barsAgo)}`);
    }
    const ahead = d === "bullish" ? i.liquidity.nearestAbove : i.liquidity.nearestBelow;
    if (ahead && Number.isFinite(ahead.distanceAtr) && Math.abs(ahead.distanceAtr) <= 3) {
      v += 4;
      r.push(`liquidez-alvo a ${dec(Math.abs(ahead.distanceAtr), 1)} ATR`);
    }
    if (i.setup && /liquidez|fundo|topo/.test(i.setup.keyLevel.source)) {
      v += 3;
      r.push(`zona de entrada em ${i.setup.keyLevel.source}`);
    }
    add("liquidity", (v / 15) * W.liquidity, r.length ? r : ["sem evento de liquidez relevante"]);
    if (ahead && Number.isFinite(ahead.distanceAtr) && Math.abs(ahead.distanceAtr) < 0.5) pen(d === "bullish" ? "Resistance nearby" : "Support nearby", -3);
    const against = i.liquidity.recentSweeps.find((s) => s.direction !== d && s.barsAgo <= 3);
    if (against) pen(`Varredura contrária recente (${pt(POOL_KIND_PT, against.kind)})`, -3);
  }

  // HTF Alignment (15): proporcional ao score ponderado na direção
  {
    const available = i.mtf.rows.length >= 3;
    const a = (i.mtf.alignmentScore * sg) / 100;
    add("htf", a * W.htf, [`alinhamento ${i.mtf.alignmentScore > 0 ? "+" : ""}${i.mtf.alignmentScore}${i.mtf.summary ? ` (${i.mtf.summary})` : ""}`], available);
    if (available && a <= -0.6) {
      pen("Timeframes em conflito", -5);
      noTrade.push("Timeframes superiores fortemente contra a direção");
    }
  }

  // Volume (10): RVOL e z-score do último candle fechado
  {
    const t = i.technicals;
    const r: string[] = [];
    let v = 0;
    if (t.rvol != null) {
      v += t.rvol >= 2 ? 7 : t.rvol >= 1.5 ? 5 : t.rvol >= 1 ? 3 : 0;
      r.push(`RVOL ${dec(t.rvol, 2)}×`);
      if (t.rvol < 0.6) pen("Volume baixo (RVOL < 0,6)", -2);
    }
    if (t.volumeZ != null && t.volumeZ >= 2) {
      v += 3;
      r.push(`z-score ${dec(t.volumeZ, 1)}`);
    }
    add("volume", (v / 10) * W.volume, r, t.rvol != null);
  }

  // Momentum (10): RSI em zona de força 4, MACD a favor 3 (+1 acelerando), EMAs a favor 2
  {
    const t = i.technicals;
    const r: string[] = [];
    let v = 0;
    if (t.rsi != null) {
      const rsiD = sg > 0 ? t.rsi : 100 - t.rsi;
      if (rsiD >= 50 && rsiD <= 70) {
        v += 4;
        r.push(`RSI ${dec(t.rsi, 1)} em zona de força`);
      } else if (rsiD > 75) {
        r.push(`RSI ${dec(t.rsi, 1)} esticado`);
        pen(sg > 0 ? "RSI sobrecomprado" : "RSI sobrevendido", -2);
      } else r.push(`RSI ${dec(t.rsi, 1)}`);
    }
    if (t.macd.histogram != null && sg * t.macd.histogram > 0) {
      v += 3;
      if (t.macd.histogramRising === sg > 0) v += 1;
      r.push("MACD a favor");
    }
    if (sg * t.emaScore > 30) {
      v += 2;
      r.push(`EMAs a favor (${t.emaScore})`);
    }
    for (const dv of t.divergences.filter((x) => x.barsAgo <= 15)) {
      const bull = dv.type.endsWith("bullish");
      const favorable = (bull && sg > 0) || (!bull && sg < 0);
      if (!favorable && dv.type.startsWith("regular")) pen(bull ? "Bullish divergence" : "Bearish divergence", -4);
      if (favorable) r.push(`divergência ${dv.type.startsWith("regular") ? "regular" : "oculta"} a favor`);
    }
    add("momentum", (v / 10) * W.momentum, r.length ? r : ["momentum neutro"]);
  }

  // Derivatives (10): neutro 5; funding com o outro lado pagando +2; OI ↑ com preço a favor +3
  {
    const dv = i.derivatives;
    const avail = dv != null && (dv.fundingRate != null || dv.openInterestChange24hPct != null);
    const r: string[] = [];
    let v = avail ? 5 : 0;
    if (dv?.fundingRate != null) {
      const f = dv.fundingRate * sg;
      if (f > 0.0005) {
        pen("Funding elevado (lado lotado)", -2);
        r.push(`funding ${dec(dv.fundingRate * 100, 4)}% lotado`);
      } else if (f < 0) {
        v += 2;
        r.push(`funding ${dec(dv.fundingRate * 100, 4)}%: o outro lado paga`);
      } else r.push(`funding ${dec(dv.fundingRate * 100, 4)}% neutro`);
    }
    if (dv?.openInterestChange24hPct != null && dv.priceChange24hPct != null) {
      const oiUp = dv.openInterestChange24hPct > 0;
      const priceFav = sg * dv.priceChange24hPct > 0;
      if (oiUp && priceFav) {
        v += 3;
        r.push("OI ↑ com preço a favor");
      } else if (oiUp && !priceFav) {
        pen("OI ↑ com preço contra", -2);
        r.push("OI ↑ com preço contra");
      } else r.push(`OI ${dec(dv.openInterestChange24hPct, 1)}% em 24h`);
    }
    add("derivatives", (v / 10) * W.derivatives, avail ? r : ["indisponível para este instrumento/fonte"], avail);
  }

  // Historical (10): expectativa em R do recorte com amostra mínima (E × 25, até 10)
  {
    const h = i.historical;
    const avail = h != null && h.expectancyR != null && h.samples >= h.minSample;
    const e = h?.expectancyR ?? 0;
    add("historical", avail ? clamp(e * 25, 0, 10) * (W.historical / 10) : 0, h ? [`expectativa ${h.expectancyR != null ? `${e >= 0 ? "+" : ""}${dec(e, 2)}R` : "—"} · n=${h.samples}${h.samples < h.minSample ? " (amostra pequena)" : ""}`] : ["sem backtest para este recorte"], avail);
    if (avail && e < -0.1) pen("Expectativa histórica negativa", -3);
  }

  // Risk Quality (10): R:R até o TP1
  {
    const rr = i.setup?.rr ?? null;
    let v = 0;
    const r: string[] = [];
    if (rr == null) noTrade.push("Sem geometria de setup (entrada/invalidação/alvo)");
    else {
      v = rr >= 3 ? 10 : rr >= 2 ? 8 : rr >= 1.5 ? 6 : rr >= 1 ? 3 : 0;
      if (rr < 1) noTrade.push(`R:R até o TP1 abaixo de 1 (${dec(rr, 2)})`);
      r.push(`R:R ${dec(rr, 2)} até o TP1`);
    }
    add("risk", (v / 10) * W.risk, r, rr != null);
  }

  // penalidades de contexto
  const pos = i.external.rangePosition;
  if (pos != null) {
    if (d === "bullish" && pos > 0.8) pen("Compra no topo da faixa (premium)", -3);
    if (d === "bearish" && pos < 0.2) pen("Venda no fundo da faixa (desconto)", -3);
  }
  if (i.technicals.volatility === "EXTREME") pen("Volatilidade extrema", -3);
  let dataIssue = false;
  const dsTxt = ({ DEGRADED: "degradados", DELAYED: "atrasados", OFFLINE: "offline" } as Record<string, string>)[i.dataStatus ?? ""] ?? i.dataStatus;
  if (i.dataStatus && i.dataStatus !== "LIVE" && i.dataStatus !== "FALLBACK") {
    pen(`Dados ${dsTxt}`, -5);
    if (i.dataStatus === "OFFLINE" || i.dataStatus === "DELAYED") {
      noTrade.push(`Dados ${dsTxt}: sem base atual para operar`);
      dataIssue = true;
    }
  }

  const raw = r1(comps.reduce((s, c) => s + c.score, 0));
  const penaltyTotal = penalties.reduce((s, p) => s + p.points, 0);
  const score = Math.round(clamp(raw + penaltyTotal, 0, 100));
  if (score < 40) noTrade.push(`Confluência ${score}/100 (baixa)`);
  const verdict: Verdict = noTrade.length ? "NO_TRADE" : score >= 60 ? "TRADE_CANDIDATE" : "WATCH";
  const conflicting = noTrade.some((n) => n.startsWith("Timeframes superiores"));
  const condition: ConfluenceResult["condition"] = dataIssue ? "DATA_UNAVAILABLE" : conflicting ? "CONFLICTING_TIMEFRAMES" : !i.setup ? "NO_SETUP" : score < 40 ? "LOW_CONFLUENCE" : "OK";
  return { direction: d, raw, penaltyTotal, score, components: comps, penalties, verdict, noTradeReasons: noTrade, label: scoreLabel(score), condition };
}
