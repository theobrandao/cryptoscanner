import type { Timeframe } from "@/types/market";
import { timeframesForLegacyPlan, type LegacyPlanKey } from "@/lib/access-policy";

export type PlanKey = LegacyPlanKey;

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  /** timeframes liberados no scanner */
  timeframes: Timeframe[];
  /** análises de imagem por dia (Infinity = ilimitado) */
  imageAnalysesPerDay: number;
  maxAgents: number;
  /** vigias multipadrão (Sentinela) — slots separados dos agentes */
  maxSentinels: number;
  telegramAlerts: boolean;
  benefits: string[];
}

/**
 * Regras de plano (camada legada). A chave interna PLATINUM é exibida ao usuário como "Elite" (plano ELITE). Valores da referência pública: PLATINUM = análises ilimitadas, timeframes até 15M,
 * até 15 agentes simultâneos, alertas no Telegram; 1H/30M/15M bloqueados fora do PLATINUM.
 * Limites de FREE/PRO não são públicos — os números abaixo são deste projeto.
 * Timeframes vêm da regra única (`lib/access-policy.ts`): abaixo de 4H só no ELITE.
 */
export const PLANS: Record<PlanKey, PlanDefinition> = {
  FREE: {
    key: "FREE",
    name: "Free",
    timeframes: timeframesForLegacyPlan("FREE"),
    imageAnalysesPerDay: 3,
    maxAgents: 2,
    maxSentinels: 1,
    telegramAlerts: false,
    benefits: [
      "Scanner em 4H, 1D e 7D",
      "3 análises de gráfico por IA por dia",
      "Até 2 agentes + 1 Sentinela",
      "Alertas no painel",
    ],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    timeframes: timeframesForLegacyPlan("PRO"),
    imageAnalysesPerDay: 30,
    maxAgents: 5,
    maxSentinels: 3,
    telegramAlerts: true,
    benefits: [
      "Scanner em 4H, 1D e 7D",
      "30 análises de gráfico por IA por dia",
      "Até 5 agentes + 3 Sentinelas",
      "Alertas no Telegram",
    ],
  },
  PLATINUM: {
    key: "PLATINUM",
    name: "Elite",
    timeframes: timeframesForLegacyPlan("PLATINUM"),
    imageAnalysesPerDay: Number.POSITIVE_INFINITY,
    maxAgents: 15,
    maxSentinels: 10,
    telegramAlerts: true,
    benefits: [
      "Scanner também em 1H, 30M e 15M",
      "Até 15 agentes + 10 Sentinelas",
      "Análise de gráfico sem limite diário",
      "Alertas no Telegram",
    ],
  },
};

export function planAllowsTimeframe(
  plan: PlanKey | null | undefined,
  tf: Timeframe,
): boolean {
  return timeframesForLegacyPlan(plan).includes(tf);
}
