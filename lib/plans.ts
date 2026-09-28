import type { Timeframe } from "@/types/market";

export type PlanKey = "FREE" | "PRO" | "PLATINUM";

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  /** timeframes liberados no scanner */
  timeframes: Timeframe[];
  /** análises de imagem por dia (Infinity = ilimitado) */
  imageAnalysesPerDay: number;
  maxAgents: number;
  telegramAlerts: boolean;
  benefits: string[];
}

/**
 * Regras de plano. Valores da referência pública: PLATINUM = análises ilimitadas, timeframes até 15M,
 * até 15 agentes simultâneos, alertas no Telegram; 1H/30M/15M bloqueados fora do PLATINUM.
 * Limites de FREE/PRO não são públicos — os números abaixo são deste projeto.
 */
export const PLANS: Record<PlanKey, PlanDefinition> = {
  FREE: {
    key: "FREE",
    name: "Free",
    timeframes: ["4h", "1d", "1w"],
    imageAnalysesPerDay: 3,
    maxAgents: 2,
    telegramAlerts: false,
    benefits: ["Scanner em 4H, 1D e 7D", "3 análises de gráfico por IA por dia", "Até 2 agentes", "Alertas no painel"],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    timeframes: ["4h", "1d", "1w"],
    imageAnalysesPerDay: 30,
    maxAgents: 5,
    telegramAlerts: true,
    benefits: ["Scanner em 4H, 1D e 7D", "30 análises de gráfico por IA por dia", "Até 5 agentes", "Alertas no Telegram"],
  },
  PLATINUM: {
    key: "PLATINUM",
    name: "Platinum",
    timeframes: ["5m", "15m", "30m", "1h", "4h", "1d", "1w"],
    imageAnalysesPerDay: Number.POSITIVE_INFINITY,
    maxAgents: 15,
    telegramAlerts: true,
    benefits: ["⚡ Análises ilimitadas de IA", "⏱️ Timeframes até 15M", "🤖 Até 15 agentes simultâneos", "🔔 Alertas no Telegram"],
  },
};

export function planAllowsTimeframe(plan: PlanKey | null | undefined, tf: Timeframe): boolean {
  return PLANS[plan ?? "FREE"].timeframes.includes(tf);
}
