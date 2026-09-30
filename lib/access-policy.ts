import { TIMEFRAMES, type Timeframe } from "@/types/market";

/**
 * Regra única de acesso, derivada só do Tier (decidido no servidor a partir da assinatura).
 * Scanner, agentes, Sentinelas, monitores, Analista IA e análises consultam esta tabela; `lib/entitlements.ts`
 * e `lib/plans.ts` derivam daqui os timeframes, para que a mesma conta receba a mesma resposta em qualquer rota.
 *
 * Decisão aprovada (docs/plans/2026-09-30-melhorias.md): tudo abaixo de 4H (1H, 30M, 15M, 5M, 1M) é do ELITE.
 * TRIAL e PRO ficam com 4H, 1D e 1W. ADMIN recebe tudo.
 *
 * Módulo folha: não importa entitlements/plans (eles importam daqui), para não criar ciclo de módulos.
 */
export type Tier = "TRIAL" | "PRO" | "ELITE" | "NONE" | "ADMIN";
export const TIERS: readonly Tier[] = ["NONE", "TRIAL", "PRO", "ELITE", "ADMIN"];

/** Chave legada de User.plan. PLATINUM é interna e nunca aparece ao usuário (é o ELITE). */
export type LegacyPlanKey = "FREE" | "PRO" | "PLATINUM";
/** Planos vendidos (Subscription.plan). */
export type SalePlan = "PRO" | "ELITE";

/** Timeframes abaixo de 4H: exclusivos do ELITE (e do ADMIN). */
export function isIntradayTimeframe(tf: Timeframe): boolean {
  const i = TIMEFRAMES.indexOf(tf);
  return i >= 0 && i < TIMEFRAMES.indexOf("4h");
}

export const BASE_TIMEFRAMES: readonly Timeframe[] = TIMEFRAMES.filter((tf) => !isIntradayTimeframe(tf));
export const INTRADAY_TIMEFRAMES: readonly Timeframe[] = TIMEFRAMES.filter((tf) => isIntradayTimeframe(tf));
export const ALL_TIMEFRAMES: readonly Timeframe[] = [...TIMEFRAMES];

/** Recursos do produto. `core` = teste/PRO/ELITE/admin; `elite` = só ELITE/admin. */
export const FEATURE_LEVEL = {
  terminal: "core",
  scanner: "core",
  agents: "core",
  sentinels: "core",
  monitors: "core",
  alerts: "core",
  analyst: "core",
  analysis: "core",
  chartAnalysis: "core",
  strategies: "core",
  backtest: "core",
  derivatives: "core",
  telegramAlerts: "core",
  intradayTimeframes: "elite",
  multiTimeframeBacktest: "elite",
  replay: "elite",
  advancedStrategies: "elite",
  advancedPortfolioRisk: "elite",
} as const;
export type Feature = keyof typeof FEATURE_LEVEL;
export const FEATURES = Object.keys(FEATURE_LEVEL) as Feature[];
/** Recursos que recebem um timeframe (checados com `allowsTimeframe`). */
export const TIMEFRAME_FEATURES = ["scanner", "agents", "sentinels", "monitors", "alerts", "analyst", "analysis", "chartAnalysis", "strategies", "backtest"] as const satisfies readonly Feature[];

export interface TierLimits {
  maxAlerts: number;
  maxMonitors: number;
  maxStrategies: number;
  aiQueriesPerDay: number;
  historyDays: number;
}

/** Limites por tier (mesmos números de antes; mudar aqui é decisão comercial do dono). */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  NONE: { maxAlerts: 0, maxMonitors: 0, maxStrategies: 0, aiQueriesPerDay: 0, historyDays: 0 },
  // trial com limites anti-abuso (menos alertas/monitores que o PRO)
  TRIAL: { maxAlerts: 5, maxMonitors: 1, maxStrategies: 2, aiQueriesPerDay: 10, historyDays: 90 },
  PRO: { maxAlerts: 50, maxMonitors: 5, maxStrategies: 10, aiQueriesPerDay: 100, historyDays: 365 },
  ELITE: { maxAlerts: 200, maxMonitors: 20, maxStrategies: 50, aiQueriesPerDay: 500, historyDays: 1095 },
  ADMIN: { maxAlerts: 1000, maxMonitors: 100, maxStrategies: 500, aiQueriesPerDay: 5000, historyDays: 3650 },
};

export function hasCore(tier: Tier): boolean {
  return tier !== "NONE";
}

export function hasElite(tier: Tier): boolean {
  return tier === "ELITE" || tier === "ADMIN";
}

export function canUse(tier: Tier, feature: Feature): boolean {
  return FEATURE_LEVEL[feature] === "elite" ? hasElite(tier) : hasCore(tier);
}

/** Timeframes liberados para o tier (qualquer recurso). */
export function timeframesFor(tier: Tier): Timeframe[] {
  if (!hasCore(tier)) return [];
  return hasElite(tier) ? [...ALL_TIMEFRAMES] : [...BASE_TIMEFRAMES];
}

/** O tier pode usar `feature` neste timeframe? Timeframe desconhecido nunca é liberado. */
export function allowsTimeframe(tier: Tier, tf: string, feature: Feature = "scanner"): boolean {
  if (!canUse(tier, feature)) return false;
  return (timeframesFor(tier) as string[]).includes(tf);
}

/**
 * Timeframes da camada legada (`lib/plans.ts`): PLATINUM segue o ELITE; PRO e FREE ficam com a lista base
 * (FREE nem chega às ferramentas: o acesso é barrado antes, em `requireCoreUser`).
 */
export function timeframesForLegacyPlan(plan: LegacyPlanKey | null | undefined): Timeframe[] {
  return plan === "PLATINUM" ? timeframesFor("ELITE") : [...BASE_TIMEFRAMES];
}

/** Plano legado (User.plan) correspondente ao tier, usado pelos limites já existentes (agentes, Sentinelas, imagens). */
export function legacyPlanFor(tier: Tier): LegacyPlanKey {
  return hasElite(tier) ? "PLATINUM" : tier === "PRO" || tier === "TRIAL" ? "PRO" : "FREE";
}

/** Único ponto da conversão plano vendido → chave legada (ELITE → PLATINUM). */
export function legacyPlanForSalePlan(plan: "ELITE"): "PLATINUM";
export function legacyPlanForSalePlan(plan: "PRO"): "PRO";
export function legacyPlanForSalePlan(plan: string): "PRO" | "PLATINUM";
export function legacyPlanForSalePlan(plan: string): "PRO" | "PLATINUM" {
  return plan === "ELITE" ? "PLATINUM" : "PRO";
}

/** Conversão inversa: chave legada → plano vendido (PLATINUM → ELITE). FREE não é plano vendido. */
export function salePlanForLegacyPlan(plan: LegacyPlanKey): SalePlan | null {
  return plan === "PLATINUM" ? "ELITE" : plan === "PRO" ? "PRO" : null;
}
