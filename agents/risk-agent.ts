import { z } from "zod";
import { defineAgent } from "@/agents/runtime";
import { candleSchema, symbolSchema, tickerSchema, timeframeSchema } from "@/agents/schemas";
import type { IndicatorTools } from "@/agents/tools";
import { round } from "@/lib/indicators/core";

/**
 * RISK AGENT
 * Mede volatilidade (ATR, desvio dos retornos), liquidez (volume em USD), distância a
 * suporte/resistência e devolve um nível de risco relativo com um stop sugerido por ATR.
 * Não emite recomendação de operação; entrega medidas para o orquestrador ponderar.
 */
export const riskInputSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  candles: z.array(candleSchema).min(40),
  ticker: tickerSchema.nullable().default(null),
});

export const riskOutputSchema = z.object({
  symbol: z.string(),
  volatilityPct: z.number().or(z.nan()),
  atrPct: z.number().or(z.nan()),
  liquidity: z.object({
    quoteVolume24h: z.number().nullable(),
    /** 0..100 relativo ao universo (BTC≈100) */
    score: z.number().min(0).max(100),
    tier: z.enum(["high", "medium", "low", "unknown"]),
  }),
  distanceToSupportPct: z.number().nullable(),
  distanceToResistancePct: z.number().nullable(),
  /** stop sugerido a 1,5×ATR abaixo/acima do preço, em % */
  suggestedStopPct: z.number().or(z.nan()),
  /** relação (distância à resistência) / (distância ao suporte) para viés de alta; inverso para baixa */
  rewardRiskLong: z.number().nullable(),
  rewardRiskShort: z.number().nullable(),
  riskLevel: z.enum(["low", "medium", "high", "extreme"]),
  riskScore: z.number().min(0).max(100),
  notes: z.array(z.string()),
});

export type RiskInput = z.infer<typeof riskInputSchema>;
export type RiskOutput = z.infer<typeof riskOutputSchema>;

function liquidityScore(quoteVolume24h: number | null): { score: number; tier: "high" | "medium" | "low" | "unknown" } {
  if (quoteVolume24h === null || !Number.isFinite(quoteVolume24h)) return { score: 0, tier: "unknown" };
  // escala logarítmica: 1e6 USD → ~0, 1e10 USD → 100
  const score = Math.max(0, Math.min(100, ((Math.log10(Math.max(quoteVolume24h, 1)) - 6) / 4) * 100));
  const tier = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score: Math.round(score), tier };
}

export const riskAgent = defineAgent<RiskInput, RiskOutput>({
  name: "risk-agent",
  purpose: "Quantificar volatilidade, liquidez e distância a níveis para classificar o risco relativo do ativo.",
  inputs: ["symbol", "timeframe", "candles", "ticker"],
  outputs: ["volatilityPct", "atrPct", "liquidity", "distanceToSupportPct", "distanceToResistancePct", "suggestedStopPct", "rewardRiskLong", "rewardRiskShort", "riskLevel", "riskScore", "notes"],
  allowedTools: ["indicators"],
  rules: ["Risco é relativo ao universo monitorado; não é uma métrica absoluta de perda.", "Sem ticker, a liquidez é 'unknown' e o risco sobe um degrau."],
  timeoutMs: 8_000,
  inputSchema: riskInputSchema,
  outputSchema: riskOutputSchema,

  async run(input, ctx) {
    const indicators = ctx.tools.use<IndicatorTools>("indicators");
    const s = indicators.snapshot(input.candles);
    const notes: string[] = [];
    const qv = input.ticker?.quoteVolume24h ?? null;
    const liq = liquidityScore(qv);
    const sup = s.supports[0];
    const res = s.resistances[0];
    const dSup = sup ? ((s.price - sup.price) / s.price) * 100 : null;
    const dRes = res ? ((res.price - s.price) / s.price) * 100 : null;
    const stopPct = Number.isFinite(s.atrPct) ? s.atrPct * 1.5 : NaN;

    let score = 0;
    if (Number.isFinite(s.atrPct)) {
      // ATR% por barra: 4h em cripto costuma ficar entre 0,5% e 3%
      score += Math.min(40, s.atrPct * 12);
      if (s.atrPct > 3) notes.push(`ATR de ${s.atrPct}% por candle: volatilidade elevada para o timeframe.`);
    } else {
      score += 25;
      notes.push("ATR indisponível (série curta).");
    }
    if (Number.isFinite(s.volatilityPct)) score += Math.min(25, s.volatilityPct * 5);
    score += liq.tier === "unknown" ? 20 : (100 - liq.score) * 0.25;
    if (liq.tier === "low") notes.push("Liquidez baixa: maior deslizamento e risco de gaps.");
    if (dSup !== null && dSup < 1) notes.push("Preço a menos de 1% do suporte: perda do nível invalida o cenário rapidamente.");
    if (dRes !== null && dRes < 1) notes.push("Preço a menos de 1% da resistência: espaço limitado sem rompimento.");
    if (s.relativeVolume >= 2.5) notes.push(`Volume relativo ${s.relativeVolume}×: movimento pode ser exaustão ou início de impulso.`);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const riskLevel = score >= 75 ? "extreme" : score >= 55 ? "high" : score >= 35 ? "medium" : "low";

    const rrLong = dSup !== null && dRes !== null && dSup > 0 ? round(dRes / Math.max(dSup, stopPct || dSup), 2) : null;
    const rrShort = dSup !== null && dRes !== null && dRes > 0 ? round(dSup / Math.max(dRes, stopPct || dRes), 2) : null;

    ctx.log("info", "risco avaliado", { riskLevel, score, liquidity: liq.tier });
    return {
      symbol: input.symbol,
      volatilityPct: s.volatilityPct,
      atrPct: s.atrPct,
      liquidity: { quoteVolume24h: qv, score: liq.score, tier: liq.tier },
      distanceToSupportPct: dSup === null ? null : round(dSup, 2),
      distanceToResistancePct: dRes === null ? null : round(dRes, 2),
      suggestedStopPct: round(stopPct, 3),
      rewardRiskLong: rrLong,
      rewardRiskShort: rrShort,
      riskLevel,
      riskScore: score,
      notes,
    };
  },
});
