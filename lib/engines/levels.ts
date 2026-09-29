import type { Candle } from "@/types/market";
import type { Swing } from "@/lib/engines/structure";

/**
 * Suporte e Resistência — zonas de REAÇÃO formadas por agrupamento de swings (externos + internos).
 * Diferente de liquidez (pools de stops: EQH/EQL, PDH/PDL, PWH/PWL): aqui interessa onde o preço reagiu.
 *
 *   - swings ordenados por preço; um grupo aceita swings a ≤ tolAtr × ATR do primeiro do grupo;
 *   - nível = média dos preços; zona = [mín, máx] do grupo com largura mínima de 0,2 ATR;
 *   - toques = nº de swings; só grupos com ≥ 2 toques, salvo quando não há nenhum do lado (usa 1 toque);
 *   - papel pelo último fechamento: acima = resistência, abaixo = suporte (nível rompido troca de papel).
 */
export interface SrLevel {
  price: number;
  low: number;
  high: number;
  touches: number;
  lastTime: number;
  role: "support" | "resistance";
  /** distância do último fechamento ao nível, em ATR (positivo = acima) */
  distanceAtr: number;
}

export interface SrMap {
  resistances: SrLevel[];
  supports: SrLevel[];
  nearestResistance: SrLevel | null;
  nearestSupport: SrLevel | null;
}

export function supportResistance(candles: readonly Candle[], swings: readonly Swing[], atr: number, opts: { tolAtr?: number; perSide?: number } = {}): SrMap {
  const empty: SrMap = { resistances: [], supports: [], nearestResistance: null, nearestSupport: null };
  const close = candles[candles.length - 1]?.close;
  if (close == null || !Number.isFinite(atr) || atr <= 0 || !swings.length) return empty;
  const tol = (opts.tolAtr ?? 0.35) * atr;
  const perSide = opts.perSide ?? 3;
  const uniq = new Map<string, Swing>();
  for (const s of swings) uniq.set(`${s.index}:${s.kind}`, s);
  const sorted = [...uniq.values()].sort((a, b) => a.price - b.price);
  const groups: Swing[][] = [];
  for (const s of sorted) {
    const g = groups[groups.length - 1];
    if (g && s.price - (g[0] as Swing).price <= tol) g.push(s);
    else groups.push([s]);
  }
  const all: SrLevel[] = groups.map((g) => {
    const prices = g.map((s) => s.price);
    const price = prices.reduce((a, b) => a + b, 0) / prices.length;
    let low = Math.min(...prices);
    let high = Math.max(...prices);
    if (high - low < 0.2 * atr) {
      low = price - 0.1 * atr;
      high = price + 0.1 * atr;
    }
    return { price, low, high, touches: g.length, lastTime: Math.max(...g.map((s) => s.time)), role: price > close ? "resistance" : "support", distanceAtr: (price - close) / atr };
  });
  const pick = (role: SrLevel["role"]) => {
    const side = all.filter((l) => l.role === role);
    const strong = side.filter((l) => l.touches >= 2);
    const base = strong.length ? strong : side;
    return base.sort((a, b) => Math.abs(a.distanceAtr) - Math.abs(b.distanceAtr)).slice(0, perSide);
  };
  const resistances = pick("resistance");
  const supports = pick("support");
  return { resistances, supports, nearestResistance: resistances[0] ?? null, nearestSupport: supports[0] ?? null };
}
