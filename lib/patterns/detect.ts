import type { Candle, Direction } from "@/types/market";
import { atr, last, round } from "@/lib/indicators/core";
import { findPivots, linearRegression, supportResistance, type Level, type Pivot } from "@/lib/indicators/levels";
import { PATTERN_CATALOG, type PatternKey } from "@/lib/patterns/catalog";

export interface PatternMatch {
  key: PatternKey;
  label: string;
  direction: Direction;
  /** 0..100 — grau de aderência geométrica; não é probabilidade de resultado. */
  confidence: number;
  price: number;
  target: number | null;
  stop: number | null;
  /** índices de candles e níveis usados na detecção (para desenhar no gráfico) */
  points: Array<{ index: number; price: number; time: number; role: string }>;
  levels: Array<{ price: number; role: string }>;
  summary: string;
  /** ajuste de contexto aplicado a posteriori (ex.: altcoin contra a tendência do BTC) */
  context?: { btcTrend: Direction; adjustment: number; note: string };
}

export interface DetectOptions {
  /** barras à esquerda/direita para pivôs fractais */
  pivotWindow?: number;
  /** quantos candles do final considerar */
  lookback?: number;
  /** confiança mínima para retornar */
  minConfidence?: number;
}

interface Ctx {
  candles: readonly Candle[];
  pivots: Pivot[];
  highs: Pivot[];
  lows: Pivot[];
  price: number;
  atr: number;
  n: number;
  supports: Level[];
  resistances: Level[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * Detecta os padrões do catálogo nos candles fornecidos.
 * Regras geométricas próprias baseadas em pivôs fractais e ATR; sem LLM.
 */
export function detectPatterns(input: readonly Candle[], options: DetectOptions = {}): PatternMatch[] {
  const { pivotWindow = 3, lookback = 160, minConfidence = 55 } = options;
  const candles = input.slice(-lookback);
  const lastCandle = candles[candles.length - 1];
  if (!lastCandle || candles.length < 40) return [];

  const a = last(atr(candles, 14));
  if (!Number.isFinite(a) || a <= 0) return [];
  const pivots = findPivots(candles, pivotWindow, pivotWindow);
  const { supports, resistances } = supportResistance(candles, { left: pivotWindow, right: pivotWindow });
  const ctx: Ctx = {
    candles,
    pivots,
    highs: pivots.filter((p) => p.kind === "high"),
    lows: pivots.filter((p) => p.kind === "low"),
    price: lastCandle.close,
    atr: a,
    n: candles.length,
    supports,
    resistances,
  };

  const detectors: Array<(c: Ctx) => PatternMatch | null> = [
    detectDoubleBottom,
    detectDoubleTop,
    detectInverseHeadShoulders,
    detectHeadShoulders,
    detectAscendingTriangle,
    detectDescendingTriangle,
    detectBullFlag,
    detectBearFlag,
    detectFallingWedge,
    detectRisingWedge,
    detectPivotBullish,
    detectPivotBearish,
    detectSupportTouch,
    detectResistanceTouch,
    detectBearTrap,
    detectBullTrap,
    detectLateralConsolidation,
  ];

  const matches: PatternMatch[] = [];
  for (const d of detectors) {
    const m = d(ctx);
    if (m && m.confidence >= minConfidence) matches.push(m);
  }
  return matches.sort((x, y) => y.confidence - x.confidence);
}

function make(ctx: Ctx, key: PatternKey, confidence: number, extra: Partial<Pick<PatternMatch, "target" | "stop" | "points" | "levels" | "summary">>): PatternMatch {
  const info = PATTERN_CATALOG[key];
  return {
    key,
    label: info.label,
    direction: info.direction,
    confidence: Math.round(clamp(confidence)),
    price: ctx.price,
    target: extra.target ?? null,
    stop: extra.stop ?? null,
    points: extra.points ?? [],
    levels: extra.levels ?? [],
    summary: extra.summary ?? info.description,
  };
}

function pt(ctx: Ctx, p: Pivot, role: string) {
  return { index: p.index, price: p.price, time: p.time, role };
}

/** distância relativa entre dois preços, em múltiplos de ATR */
function atrDist(ctx: Ctx, a: number, b: number) {
  return Math.abs(a - b) / ctx.atr;
}

/** recência: 1 quando o último pivô está próximo do final da série */
/** Projeta a reta que passa por dois pivôs até o índice `at` (inclinação em preço por barra). */
function projectLine(a: Pivot, b: Pivot, at: number): number {
  if (b.index === a.index) return b.price;
  const slope = (b.price - a.price) / (b.index - a.index);
  return b.price + slope * (at - b.index);
}

function recency(ctx: Ctx, index: number) {
  return clamp(1 - (ctx.n - 1 - index) / 40, 0, 1);
}

// ---------------------------------------------------------------- Fundo/Topo Duplo

function detectDoubleBottom(ctx: Ctx): PatternMatch | null {
  const lows = ctx.lows.slice(-4);
  for (let i = lows.length - 1; i >= 1; i--) {
    const l2 = lows[i];
    const l1 = lows[i - 1];
    if (!l1 || !l2) continue;
    if (l2.index - l1.index < 5 || l2.index - l1.index > 60) continue;
    const diff = atrDist(ctx, l1.price, l2.price);
    if (diff > 0.6 || Math.abs(l1.price - l2.price) / l2.price > 0.015) continue;
    // topo intermediário (linha de pescoço)
    let neck = -Infinity;
    let neckIdx = -1;
    for (let j = l1.index; j <= l2.index; j++) {
      const h = ctx.candles[j]?.high ?? -Infinity;
      if (h > neck) {
        neck = h;
        neckIdx = j;
      }
    }
    const depth = (neck - Math.min(l1.price, l2.price)) / ctx.atr;
    if (depth < 1.5) continue;
    if (ctx.price < l2.price) continue; // padrão invalidado
    if (ctx.n - 1 - l2.index > 40) continue; // fundo 2 antigo demais
    if (ctx.price > neck + (neck - Math.min(l1.price, l2.price)) * 0.5) continue; // já resolvido
    const brokeNeck = ctx.price > neck;
    const conf = 50 + (0.6 - diff) * 20 + Math.min(depth, 5) * 2 + (brokeNeck ? 10 : 0) + recency(ctx, l2.index) * 8;
    const height = neck - Math.min(l1.price, l2.price);
    const neckCandle = ctx.candles[neckIdx];
    return make(ctx, "double_bottom", conf, {
      target: round(neck + height, 8),
      stop: round(Math.min(l1.price, l2.price) - ctx.atr * 0.5, 8),
      points: [pt(ctx, l1, "fundo 1"), pt(ctx, l2, "fundo 2"), ...(neckCandle ? [{ index: neckIdx, price: neck, time: neckCandle.openTime, role: "pescoço" }] : [])],
      levels: [{ price: neck, role: "linha de pescoço" }],
      summary: brokeNeck ? "Fundo duplo com linha de pescoço rompida; alvo = pescoço + altura do padrão." : "Fundo duplo em formação; confirmação ao fechar acima da linha de pescoço.",
    });
  }
  return null;
}

function detectDoubleTop(ctx: Ctx): PatternMatch | null {
  const highs = ctx.highs.slice(-4);
  for (let i = highs.length - 1; i >= 1; i--) {
    const h2 = highs[i];
    const h1 = highs[i - 1];
    if (!h1 || !h2) continue;
    if (h2.index - h1.index < 5 || h2.index - h1.index > 60) continue;
    const diff = atrDist(ctx, h1.price, h2.price);
    if (diff > 0.6 || Math.abs(h1.price - h2.price) / h2.price > 0.015) continue;
    let neck = Infinity;
    let neckIdx = -1;
    for (let j = h1.index; j <= h2.index; j++) {
      const l = ctx.candles[j]?.low ?? Infinity;
      if (l < neck) {
        neck = l;
        neckIdx = j;
      }
    }
    const depth = (Math.max(h1.price, h2.price) - neck) / ctx.atr;
    if (depth < 1.5) continue;
    if (ctx.price > h2.price) continue;
    if (ctx.n - 1 - h2.index > 40) continue;
    if (ctx.price < neck - (Math.max(h1.price, h2.price) - neck) * 0.5) continue;
    const brokeNeck = ctx.price < neck;
    const conf = 50 + (0.6 - diff) * 20 + Math.min(depth, 5) * 2 + (brokeNeck ? 10 : 0) + recency(ctx, h2.index) * 8;
    const height = Math.max(h1.price, h2.price) - neck;
    const neckCandle = ctx.candles[neckIdx];
    return make(ctx, "double_top", conf, {
      target: round(neck - height, 8),
      stop: round(Math.max(h1.price, h2.price) + ctx.atr * 0.5, 8),
      points: [pt(ctx, h1, "topo 1"), pt(ctx, h2, "topo 2"), ...(neckCandle ? [{ index: neckIdx, price: neck, time: neckCandle.openTime, role: "pescoço" }] : [])],
      levels: [{ price: neck, role: "linha de pescoço" }],
      summary: brokeNeck ? "Topo duplo com linha de pescoço rompida; alvo = pescoço − altura do padrão." : "Topo duplo em formação; confirmação ao fechar abaixo da linha de pescoço.",
    });
  }
  return null;
}

// ---------------------------------------------------------------- Cabeça & Ombros

function detectInverseHeadShoulders(ctx: Ctx): PatternMatch | null {
  const lows = ctx.lows.slice(-5);
  for (let i = lows.length - 1; i >= 2; i--) {
    const rs = lows[i];
    const head = lows[i - 1];
    const ls = lows[i - 2];
    if (!rs || !head || !ls) continue;
    if (!(head.price < ls.price && head.price < rs.price)) continue;
    const shoulderDiff = atrDist(ctx, ls.price, rs.price);
    if (shoulderDiff > 1.5) continue;
    const headDepth = (Math.min(ls.price, rs.price) - head.price) / ctx.atr;
    if (headDepth < 1.2) continue;
    if (rs.index - ls.index < 10) continue;
    // linha de pescoço: máximos entre ombro esquerdo–cabeça e cabeça–ombro direito
    const neck1 = maxHigh(ctx, ls.index, head.index);
    const neck2 = maxHigh(ctx, head.index, rs.index);
    const neck = (neck1 + neck2) / 2;
    if (ctx.price < head.price) continue;
    if (ctx.n - 1 - rs.index > 30) continue;
    if (ctx.price > neck + (neck - head.price) * 0.5) continue;
    const brokeNeck = ctx.price > neck;
    const conf = 50 + (1.5 - shoulderDiff) * 8 + Math.min(headDepth, 4) * 3 + (brokeNeck ? 12 : 0) + recency(ctx, rs.index) * 8;
    return make(ctx, "inverse_head_shoulders", conf, {
      target: round(neck + (neck - head.price), 8),
      stop: round(head.price - ctx.atr * 0.5, 8),
      points: [pt(ctx, ls, "ombro esq."), pt(ctx, head, "cabeça"), pt(ctx, rs, "ombro dir.")],
      levels: [{ price: neck, role: "linha de pescoço" }],
      summary: brokeNeck ? "C&O invertido com pescoço rompido." : "C&O invertido em formação; confirmação acima da linha de pescoço.",
    });
  }
  return null;
}

function detectHeadShoulders(ctx: Ctx): PatternMatch | null {
  const highs = ctx.highs.slice(-5);
  for (let i = highs.length - 1; i >= 2; i--) {
    const rs = highs[i];
    const head = highs[i - 1];
    const ls = highs[i - 2];
    if (!rs || !head || !ls) continue;
    if (!(head.price > ls.price && head.price > rs.price)) continue;
    const shoulderDiff = atrDist(ctx, ls.price, rs.price);
    if (shoulderDiff > 1.5) continue;
    const headHeight = (head.price - Math.max(ls.price, rs.price)) / ctx.atr;
    if (headHeight < 1.2) continue;
    if (rs.index - ls.index < 10) continue;
    const neck1 = minLow(ctx, ls.index, head.index);
    const neck2 = minLow(ctx, head.index, rs.index);
    const neck = (neck1 + neck2) / 2;
    if (ctx.price > head.price) continue;
    if (ctx.n - 1 - rs.index > 30) continue;
    if (ctx.price < neck - (head.price - neck) * 0.5) continue;
    const brokeNeck = ctx.price < neck;
    const conf = 50 + (1.5 - shoulderDiff) * 8 + Math.min(headHeight, 4) * 3 + (brokeNeck ? 12 : 0) + recency(ctx, rs.index) * 8;
    return make(ctx, "head_shoulders", conf, {
      target: round(neck - (head.price - neck), 8),
      stop: round(head.price + ctx.atr * 0.5, 8),
      points: [pt(ctx, ls, "ombro esq."), pt(ctx, head, "cabeça"), pt(ctx, rs, "ombro dir.")],
      levels: [{ price: neck, role: "linha de pescoço" }],
      summary: brokeNeck ? "Cabeça & ombros com pescoço rompido." : "Cabeça & ombros em formação; confirmação abaixo da linha de pescoço.",
    });
  }
  return null;
}

function maxHigh(ctx: Ctx, from: number, to: number) {
  let m = -Infinity;
  for (let j = from; j <= to; j++) m = Math.max(m, ctx.candles[j]?.high ?? -Infinity);
  return m;
}
function minLow(ctx: Ctx, from: number, to: number) {
  let m = Infinity;
  for (let j = from; j <= to; j++) m = Math.min(m, ctx.candles[j]?.low ?? Infinity);
  return m;
}

// ---------------------------------------------------------------- Triângulos

function detectAscendingTriangle(ctx: Ctx): PatternMatch | null {
  const highs = ctx.highs.slice(-3);
  const lows = ctx.lows.slice(-3);
  if (highs.length < 2 || lows.length < 2) return null;
  const flat = spreadAtr(
    ctx,
    highs.map((h) => h.price),
  );
  if (flat > 0.8) return null;
  const lowReg = linearRegression(lows.map((l) => l.price));
  if (lowReg.slope <= 0) return null;
  const resistance = highs.reduce((s, h) => s + h.price, 0) / highs.length;
  const firstLow = lows[0];
  const lastLow = lows[lows.length - 1];
  if (!firstLow || !lastLow) return null;
  if (ctx.price > resistance * 1.02 || ctx.price < lastLow.price) return null;
  const compression = (resistance - lastLow.price) / (resistance - firstLow.price);
  if (compression >= 1 || compression < 0.15) return null;
  if (ctx.n - 1 - Math.max(lastLow.index, highs[highs.length - 1]?.index ?? 0) > 30) return null;
  const conf = 50 + (0.8 - flat) * 15 + (1 - compression) * 15 + recency(ctx, Math.max(highs[highs.length - 1]?.index ?? 0, lastLow.index)) * 8;
  const height = resistance - firstLow.price;
  return make(ctx, "ascending_triangle", conf, {
    target: round(resistance + height, 8),
    stop: round(lastLow.price - ctx.atr * 0.5, 8),
    points: [...highs.map((h) => pt(ctx, h, "topo")), ...lows.map((l) => pt(ctx, l, "fundo asc."))],
    levels: [{ price: resistance, role: "resistência" }],
    summary: `Fundos ascendentes sob resistência em ${round(resistance, 6)}; rompimento projeta +${round((height / ctx.price) * 100, 2)}%.`,
  });
}

function detectDescendingTriangle(ctx: Ctx): PatternMatch | null {
  const highs = ctx.highs.slice(-3);
  const lows = ctx.lows.slice(-3);
  if (highs.length < 2 || lows.length < 2) return null;
  const flat = spreadAtr(
    ctx,
    lows.map((l) => l.price),
  );
  if (flat > 0.8) return null;
  const highReg = linearRegression(highs.map((h) => h.price));
  if (highReg.slope >= 0) return null;
  const support = lows.reduce((s, l) => s + l.price, 0) / lows.length;
  const firstHigh = highs[0];
  const lastHigh = highs[highs.length - 1];
  if (!firstHigh || !lastHigh) return null;
  if (ctx.price < support * 0.98 || ctx.price > lastHigh.price) return null;
  const compression = (lastHigh.price - support) / (firstHigh.price - support);
  if (compression >= 1 || compression < 0.15) return null;
  if (ctx.n - 1 - Math.max(lastHigh.index, lows[lows.length - 1]?.index ?? 0) > 30) return null;
  const conf = 50 + (0.8 - flat) * 15 + (1 - compression) * 15 + recency(ctx, Math.max(lastHigh.index, lows[lows.length - 1]?.index ?? 0)) * 8;
  const height = firstHigh.price - support;
  return make(ctx, "descending_triangle", conf, {
    target: round(support - height, 8),
    stop: round(lastHigh.price + ctx.atr * 0.5, 8),
    points: [...lows.map((l) => pt(ctx, l, "fundo")), ...highs.map((h) => pt(ctx, h, "topo desc."))],
    levels: [{ price: support, role: "suporte" }],
    summary: `Topos descendentes sobre suporte em ${round(support, 6)}; perda projeta −${round((height / ctx.price) * 100, 2)}%.`,
  });
}

function spreadAtr(ctx: Ctx, prices: number[]) {
  return (Math.max(...prices) - Math.min(...prices)) / ctx.atr;
}

// ---------------------------------------------------------------- Bandeiras

function detectBullFlag(ctx: Ctx): PatternMatch | null {
  return detectFlag(ctx, "bull");
}
function detectBearFlag(ctx: Ctx): PatternMatch | null {
  return detectFlag(ctx, "bear");
}

function detectFlag(ctx: Ctx, side: "bull" | "bear"): PatternMatch | null {
  const c = ctx.candles;
  const n = c.length;
  // mastro: janela de 5..15 barras terminando entre 4 e 15 barras atrás
  let best: { start: number; end: number; move: number } | null = null;
  for (let flagLen = 4; flagLen <= 15; flagLen++) {
    const poleEnd = n - 1 - flagLen;
    for (let poleLen = 5; poleLen <= 15; poleLen++) {
      const poleStart = poleEnd - poleLen;
      if (poleStart < 0) break;
      const s = c[poleStart];
      const e = c[poleEnd];
      if (!s || !e) continue;
      const move = side === "bull" ? e.high - s.low : s.high - e.low;
      if (move / ctx.atr < 3) continue;
      if (!best || move > best.move) best = { start: poleStart, end: poleEnd, move };
    }
  }
  if (!best) return null;
  const flag = c.slice(best.end + 1);
  if (flag.length < 4) return null;
  const flagHigh = Math.max(...flag.map((k) => k.high));
  const flagLow = Math.min(...flag.map((k) => k.low));
  const flagRange = flagHigh - flagLow;
  if (flagRange > best.move * 0.5) return null; // consolidação larga demais
  const reg = linearRegression(flag.map((k) => k.close));
  const drift = (reg.slope * flag.length) / ctx.atr; // deslocamento total em ATR
  // bandeira de alta: drift levemente negativo ou plano; de baixa: levemente positivo ou plano
  if (side === "bull" && drift > 0.8) return null;
  if (side === "bear" && drift < -0.8) return null;
  const poleEndCandle = c[best.end];
  const poleStartCandle = c[best.start];
  if (!poleEndCandle || !poleStartCandle) return null;
  // preço ainda dentro/próximo da bandeira
  const retrace = side === "bull" ? (poleEndCandle.high - ctx.price) / best.move : (ctx.price - poleEndCandle.low) / best.move;
  if (retrace > 0.6 || retrace < -0.1) return null;
  const conf = 50 + Math.min(best.move / ctx.atr, 8) * 2.5 + (0.5 - flagRange / best.move) * 20 + (1 - Math.abs(drift) / 1) * 5;
  const key: PatternKey = side === "bull" ? "bull_flag" : "bear_flag";
  const target = side === "bull" ? flagHigh + best.move : flagLow - best.move;
  const stop = side === "bull" ? flagLow - ctx.atr * 0.3 : flagHigh + ctx.atr * 0.3;
  return make(ctx, key, conf, {
    target: round(target, 8),
    stop: round(stop, 8),
    points: [
      { index: best.start, price: side === "bull" ? poleStartCandle.low : poleStartCandle.high, time: poleStartCandle.openTime, role: "início do mastro" },
      { index: best.end, price: side === "bull" ? poleEndCandle.high : poleEndCandle.low, time: poleEndCandle.openTime, role: "fim do mastro" },
    ],
    levels: [
      { price: flagHigh, role: "topo da bandeira" },
      { price: flagLow, role: "base da bandeira" },
    ],
    summary: `Mastro de ${round((best.move / ctx.price) * 100, 2)}% seguido de ${flag.length} candles de consolidação (faixa ${round((flagRange / ctx.price) * 100, 2)}%).`,
  });
}

// ---------------------------------------------------------------- Cunha de baixa (viés de alta)

function detectFallingWedge(ctx: Ctx): PatternMatch | null {
  const highs = ctx.highs.slice(-3);
  const lows = ctx.lows.slice(-3);
  if (highs.length < 2 || lows.length < 2) return null;
  const hReg = linearRegression(highs.map((h) => h.price));
  const lReg = linearRegression(lows.map((l) => l.price));
  if (hReg.slope >= 0 || lReg.slope >= 0) return null;
  // convergência: topos caem mais rápido que fundos (em preço por pivô)
  if (Math.abs(hReg.slope) <= Math.abs(lReg.slope) * 1.15) return null;
  const firstHigh = highs[0];
  const lastHigh = highs[highs.length - 1];
  const firstLow = lows[0];
  const lastLow = lows[lows.length - 1];
  if (!firstHigh || !lastHigh || !firstLow || !lastLow) return null;
  const widthStart = firstHigh.price - firstLow.price;
  const widthEnd = lastHigh.price - lastLow.price;
  if (widthStart <= 0 || widthEnd <= 0 || widthEnd / widthStart > 0.85) return null;
  if (ctx.n - 1 - Math.max(lastHigh.index, lastLow.index) > 30) return null;
  // linhas projetadas até o candle atual (inclinação por barra entre o primeiro e o último pivô)
  const upperNow = projectLine(firstHigh, lastHigh, ctx.n - 1);
  const lowerNow = projectLine(firstLow, lastLow, ctx.n - 1);
  if (ctx.price < lowerNow - ctx.atr * 0.5) return null; // rompeu para baixo: padrão invalidado
  const brokeUp = ctx.price > upperNow;
  const conf = 50 + (1 - widthEnd / widthStart) * 20 + (brokeUp ? 10 : 0) + recency(ctx, Math.max(lastHigh.index, lastLow.index)) * 8;
  return make(ctx, "falling_wedge", conf, {
    // alvo = movimento medido (largura máxima da cunha) projetado acima da linha superior
    target: round(upperNow + widthStart, 8),
    stop: round(lowerNow - ctx.atr * 0.5, 8),
    points: [...highs.map((h) => pt(ctx, h, "topo desc.")), ...lows.map((l) => pt(ctx, l, "fundo desc."))],
    levels: [
      { price: round(upperNow, 8), role: "linha superior" },
      { price: round(lowerNow, 8), role: "linha inferior" },
    ],
    summary: brokeUp ? "Cunha descendente rompida para cima." : "Cunha descendente em compressão; viés de alta ao romper a linha superior.",
  });
}

// ---------------------------------------------------------------- Cunha de alta (viés de baixa)

function detectRisingWedge(ctx: Ctx): PatternMatch | null {
  const highs = ctx.highs.slice(-3);
  const lows = ctx.lows.slice(-3);
  if (highs.length < 2 || lows.length < 2) return null;
  const hReg = linearRegression(highs.map((h) => h.price));
  const lReg = linearRegression(lows.map((l) => l.price));
  if (hReg.slope <= 0 || lReg.slope <= 0) return null;
  // convergência: fundos sobem mais rápido que topos (em preço por pivô)
  if (lReg.slope <= hReg.slope * 1.15) return null;
  const firstHigh = highs[0];
  const lastHigh = highs[highs.length - 1];
  const firstLow = lows[0];
  const lastLow = lows[lows.length - 1];
  if (!firstHigh || !lastHigh || !firstLow || !lastLow) return null;
  const widthStart = firstHigh.price - firstLow.price;
  const widthEnd = lastHigh.price - lastLow.price;
  if (widthStart <= 0 || widthEnd <= 0 || widthEnd / widthStart > 0.85) return null;
  if (ctx.n - 1 - Math.max(lastHigh.index, lastLow.index) > 30) return null;
  // linhas projetadas até o candle atual (inclinação por barra entre o primeiro e o último pivô)
  const upperNow = projectLine(firstHigh, lastHigh, ctx.n - 1);
  const lowerNow = projectLine(firstLow, lastLow, ctx.n - 1);
  if (ctx.price > upperNow + ctx.atr * 0.5) return null; // rompeu para cima: padrão invalidado
  const brokeDown = ctx.price < lowerNow;
  const conf = 50 + (1 - widthEnd / widthStart) * 20 + (brokeDown ? 10 : 0) + recency(ctx, Math.max(lastHigh.index, lastLow.index)) * 8;
  return make(ctx, "rising_wedge", conf, {
    // alvo = movimento medido (largura máxima da cunha) projetado abaixo da linha inferior
    target: round(lowerNow - widthStart, 8),
    stop: round(upperNow + ctx.atr * 0.5, 8),
    points: [...highs.map((h) => pt(ctx, h, "topo asc.")), ...lows.map((l) => pt(ctx, l, "fundo asc."))],
    levels: [
      { price: round(upperNow, 8), role: "linha superior" },
      { price: round(lowerNow, 8), role: "linha inferior" },
    ],
    summary: brokeDown ? "Cunha ascendente rompida para baixo." : "Cunha ascendente em compressão; viés de baixa ao romper a linha inferior.",
  });
}

// ---------------------------------------------------------------- Pivôs HH+HL / LH+LL

function detectPivotBullish(ctx: Ctx): PatternMatch | null {
  const [h1, h2] = ctx.highs.slice(-2);
  const [l1, l2] = ctx.lows.slice(-2);
  if (!h1 || !h2 || !l1 || !l2) return null;
  if (!(h2.price > h1.price && l2.price > l1.price)) return null;
  const hh = (h2.price - h1.price) / ctx.atr;
  const hl = (l2.price - l1.price) / ctx.atr;
  if (hh < 0.5 || hl < 0.5) return null;
  if (ctx.price < l2.price) return null;
  const lastIdx = Math.max(h2.index, l2.index);
  if (ctx.n - 1 - lastIdx > 25) return null;
  const conf = 50 + Math.min(hh, 3) * 4 + Math.min(hl, 3) * 4 + recency(ctx, lastIdx) * 10;
  return make(ctx, "pivot_bullish", conf, {
    target: round(h2.price + (h2.price - l2.price), 8),
    stop: round(l2.price - ctx.atr * 0.3, 8),
    points: [pt(ctx, h1, "topo"), pt(ctx, h2, "HH"), pt(ctx, l1, "fundo"), pt(ctx, l2, "HL")],
    levels: [{ price: l2.price, role: "fundo mais alto (HL)" }],
    summary: "Estrutura de alta: topo mais alto e fundo mais alto nos pivôs recentes.",
  });
}

function detectPivotBearish(ctx: Ctx): PatternMatch | null {
  const [h1, h2] = ctx.highs.slice(-2);
  const [l1, l2] = ctx.lows.slice(-2);
  if (!h1 || !h2 || !l1 || !l2) return null;
  if (!(h2.price < h1.price && l2.price < l1.price)) return null;
  const lh = (h1.price - h2.price) / ctx.atr;
  const ll = (l1.price - l2.price) / ctx.atr;
  if (lh < 0.5 || ll < 0.5) return null;
  if (ctx.price > h2.price) return null;
  const lastIdx = Math.max(h2.index, l2.index);
  if (ctx.n - 1 - lastIdx > 25) return null;
  const conf = 50 + Math.min(lh, 3) * 4 + Math.min(ll, 3) * 4 + recency(ctx, lastIdx) * 10;
  return make(ctx, "pivot_bearish", conf, {
    target: round(l2.price - (h2.price - l2.price), 8),
    stop: round(h2.price + ctx.atr * 0.3, 8),
    points: [pt(ctx, h1, "topo"), pt(ctx, h2, "LH"), pt(ctx, l1, "fundo"), pt(ctx, l2, "LL")],
    levels: [{ price: h2.price, role: "topo mais baixo (LH)" }],
    summary: "Estrutura de baixa: topo mais baixo e fundo mais baixo nos pivôs recentes.",
  });
}

// ---------------------------------------------------------------- Toques em S/R e armadilhas

function detectSupportTouch(ctx: Ctx): PatternMatch | null {
  const lastC = ctx.candles[ctx.n - 1];
  if (!lastC) return null;
  const sup = ctx.supports.find((s) => s.touches >= 2 && Math.abs(lastC.low - s.price) / ctx.atr <= 0.6);
  if (!sup) return null;
  const range = lastC.high - lastC.low;
  const closePos = range > 0 ? (lastC.close - lastC.low) / range : 0.5;
  if (closePos < 0.4) return null; // não reagiu
  if (lastC.close < sup.price) return null;
  const nextRes = ctx.resistances[0];
  const conf = 48 + Math.min(sup.touches, 4) * 4 + closePos * 10 + sup.strength * 8;
  return make(ctx, "support_touch", conf, {
    target: nextRes ? round(nextRes.price, 8) : null,
    stop: round(sup.price - ctx.atr * 0.6, 8),
    points: [{ index: ctx.n - 1, price: lastC.low, time: lastC.openTime, role: "toque" }],
    levels: [{ price: sup.price, role: `suporte (${sup.touches} toques)` }],
    summary: `Teste do suporte em ${round(sup.price, 6)} com fechamento ${Math.round(closePos * 100)}% acima da mínima do candle.`,
  });
}

function detectResistanceTouch(ctx: Ctx): PatternMatch | null {
  const lastC = ctx.candles[ctx.n - 1];
  if (!lastC) return null;
  const res = ctx.resistances.find((r) => r.touches >= 2 && Math.abs(lastC.high - r.price) / ctx.atr <= 0.6);
  if (!res) return null;
  const range = lastC.high - lastC.low;
  const closePos = range > 0 ? (lastC.high - lastC.close) / range : 0.5;
  if (closePos < 0.4) return null;
  if (lastC.close > res.price) return null;
  const nextSup = ctx.supports[0];
  const conf = 48 + Math.min(res.touches, 4) * 4 + closePos * 10 + res.strength * 8;
  return make(ctx, "resistance_touch", conf, {
    target: nextSup ? round(nextSup.price, 8) : null,
    stop: round(res.price + ctx.atr * 0.6, 8),
    points: [{ index: ctx.n - 1, price: lastC.high, time: lastC.openTime, role: "toque" }],
    levels: [{ price: res.price, role: `resistência (${res.touches} toques)` }],
    summary: `Teste da resistência em ${round(res.price, 6)} com fechamento ${Math.round(closePos * 100)}% abaixo da máxima do candle.`,
  });
}

function detectBearTrap(ctx: Ctx): PatternMatch | null {
  const recent = ctx.candles.slice(-4);
  const lastC = recent[recent.length - 1];
  if (!lastC) return null;
  // suporte é classificado pelo preço atual; usamos níveis com >=2 toques abaixo e próximos do preço
  for (const sup of ctx.supports.filter((s) => s.touches >= 2)) {
    const breakdownIdx = recent.findIndex((c, i) => i < recent.length - 1 && c.close < sup.price);
    if (breakdownIdx === -1) continue;
    if (lastC.close <= sup.price) continue;
    const trapLow = Math.min(...recent.slice(breakdownIdx).map((c) => c.low));
    const depth = (sup.price - trapLow) / ctx.atr;
    if (depth < 0.2) continue;
    const nextRes = ctx.resistances[0];
    const conf = 50 + Math.min(depth, 2) * 8 + Math.min(sup.touches, 4) * 3;
    const trapCandle = recent[breakdownIdx];
    return make(ctx, "bear_trap", conf, {
      target: nextRes ? round(nextRes.price, 8) : null,
      stop: round(trapLow - ctx.atr * 0.3, 8),
      points: trapCandle ? [{ index: ctx.n - recent.length + breakdownIdx, price: trapLow, time: trapCandle.openTime, role: "rompimento falso" }] : [],
      levels: [{ price: sup.price, role: "suporte recuperado" }],
      summary: `Fechamento abaixo do suporte ${round(sup.price, 6)} seguido de retorno acima do nível (rompimento falso).`,
    });
  }
  return null;
}

function detectBullTrap(ctx: Ctx): PatternMatch | null {
  const recent = ctx.candles.slice(-4);
  const lastC = recent[recent.length - 1];
  if (!lastC) return null;
  for (const res of ctx.resistances.filter((r) => r.touches >= 2)) {
    const breakoutIdx = recent.findIndex((c, i) => i < recent.length - 1 && c.close > res.price);
    if (breakoutIdx === -1) continue;
    if (lastC.close >= res.price) continue;
    const trapHigh = Math.max(...recent.slice(breakoutIdx).map((c) => c.high));
    const depth = (trapHigh - res.price) / ctx.atr;
    if (depth < 0.2) continue;
    const nextSup = ctx.supports[0];
    const conf = 50 + Math.min(depth, 2) * 8 + Math.min(res.touches, 4) * 3;
    const trapCandle = recent[breakoutIdx];
    return make(ctx, "bull_trap", conf, {
      target: nextSup ? round(nextSup.price, 8) : null,
      stop: round(trapHigh + ctx.atr * 0.3, 8),
      points: trapCandle ? [{ index: ctx.n - recent.length + breakoutIdx, price: trapHigh, time: trapCandle.openTime, role: "rompimento falso" }] : [],
      levels: [{ price: res.price, role: "resistência perdida" }],
      summary: `Fechamento acima da resistência ${round(res.price, 6)} seguido de retorno abaixo do nível (rompimento falso).`,
    });
  }
  return null;
}

// ---------------------------------------------------------------- Consolidação lateral

function detectLateralConsolidation(ctx: Ctx): PatternMatch | null {
  const win = ctx.candles.slice(-20);
  if (win.length < 20) return null;
  const hi = Math.max(...win.map((c) => c.high));
  const lo = Math.min(...win.map((c) => c.low));
  const rangeAtr = (hi - lo) / ctx.atr;
  if (rangeAtr > 3.5) return null;
  const reg = linearRegression(win.map((c) => c.close));
  const driftAtr = (reg.slope * win.length) / ctx.atr;
  if (Math.abs(driftAtr) > 1) return null;
  const conf = 50 + (3.5 - rangeAtr) * 8 + (1 - Math.abs(driftAtr)) * 10;
  return make(ctx, "lateral_consolidation", conf, {
    target: null,
    stop: null,
    points: [],
    levels: [
      { price: hi, role: "topo da faixa" },
      { price: lo, role: "base da faixa" },
    ],
    summary: `Faixa de ${round(((hi - lo) / ctx.price) * 100, 2)}% nas últimas 20 barras (${round(rangeAtr, 1)}× ATR), sem inclinação relevante.`,
  });
}
