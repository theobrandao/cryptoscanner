import type { StructureResult } from "@/lib/engines/structure";
import type { Technicals } from "@/lib/engines/technicals";

/**
 * Market Regime — classificação determinística do timeframe analisado (candles fechados).
 * Ordem de precedência (a primeira regra que casa vence):
 *   1. High Volatility — volatilidade EXTREME ou ATR% no percentil ≥ 95 das últimas 100 barras
 *   2. Compression     — ATR% no percentil ≤ 15 (faixa estreita, energia acumulada)
 *   3. Expansion       — ATR% no percentil ≥ 75 e BOS externo nas últimas 10 barras
 *   4. Bull Trend      — estrutura externa altista e EMA score ≥ +30
 *   5. Bear Trend      — estrutura externa baixista e EMA score ≤ −30
 *   6. Range           — demais casos
 */
export type MarketRegime = "Bull Trend" | "Bear Trend" | "Range" | "Expansion" | "Compression" | "High Volatility";

export interface RegimeResult {
  regime: MarketRegime;
  reasons: string[];
}

export function classifyRegime(external: StructureResult, tech: Technicals, barsInSeries: number): RegimeResult {
  const p = tech.atrPercentile;
  const ev = external.lastEvent;
  const evAgo = ev ? barsInSeries - 1 - ev.index : Infinity;
  const pTxt = p != null ? `ATR% no percentil ${Math.round(p)}` : "ATR% sem histórico";
  if (tech.volatility === "EXTREME" || (p != null && p >= 95)) return { regime: "High Volatility", reasons: [pTxt, `volatilidade ${tech.volatility ?? "—"}`] };
  if (p != null && p <= 15) return { regime: "Compression", reasons: [pTxt] };
  if (p != null && p >= 75 && ev?.type === "BOS" && evAgo <= 10) return { regime: "Expansion", reasons: [pTxt, `BOS ${ev.direction === "bullish" ? "altista" : "baixista"} há ${evAgo} candles`] };
  if (external.trend === "bullish" && tech.emaScore >= 30) return { regime: "Bull Trend", reasons: ["estrutura externa altista", `EMA score ${tech.emaScore}`] };
  if (external.trend === "bearish" && tech.emaScore <= -30) return { regime: "Bear Trend", reasons: ["estrutura externa baixista", `EMA score ${tech.emaScore}`] };
  return { regime: "Range", reasons: [external.trend === "neutral" ? "estrutura externa sem tendência" : "estrutura e EMAs não concordam", `EMA score ${tech.emaScore}`] };
}
