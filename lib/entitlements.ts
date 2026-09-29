/**
 * Entitlements — decididos no BACKEND a partir da assinatura (nunca pelo frontend).
 * Tiers: TRIAL (≈ PRO por 7 dias), PRO, ELITE, NONE (trial expirado/cancelado sem período ativo), ADMIN (dono).
 */
export type Tier = "TRIAL" | "PRO" | "ELITE" | "NONE" | "ADMIN";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export interface Entitlements {
  tier: Tier;
  /** terminal, scanner, monitor, alertas, risco, AI analyst */
  core: boolean;
  /** backtest avançado/multi-TF, replay, estratégias avançadas, portfolio risk avançado */
  elite: boolean;
  timeframes: string[];
  maxAlerts: number;
  maxMonitors: number;
  maxStrategies: number;
  aiQueriesPerDay: number;
  historyDays: number;
}

const PRO_TF = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

export const ENTITLEMENTS: Record<Tier, Entitlements> = {
  NONE: { tier: "NONE", core: false, elite: false, timeframes: [], maxAlerts: 0, maxMonitors: 0, maxStrategies: 0, aiQueriesPerDay: 0, historyDays: 0 },
  // trial com limites anti-abuso (menos alertas/monitores que o PRO)
  TRIAL: { tier: "TRIAL", core: true, elite: false, timeframes: PRO_TF, maxAlerts: 10, maxMonitors: 2, maxStrategies: 3, aiQueriesPerDay: 20, historyDays: 180 },
  PRO: { tier: "PRO", core: true, elite: false, timeframes: PRO_TF, maxAlerts: 50, maxMonitors: 5, maxStrategies: 10, aiQueriesPerDay: 100, historyDays: 365 },
  ELITE: { tier: "ELITE", core: true, elite: true, timeframes: PRO_TF, maxAlerts: 200, maxMonitors: 20, maxStrategies: 50, aiQueriesPerDay: 500, historyDays: 1095 },
  ADMIN: { tier: "ADMIN", core: true, elite: true, timeframes: PRO_TF, maxAlerts: 1000, maxMonitors: 100, maxStrategies: 500, aiQueriesPerDay: 5000, historyDays: 3650 },
};

export const TRIAL_DAYS = 7;
/** dias de tolerância após falha de pagamento antes de cortar o acesso */
export const PAST_DUE_GRACE_DAYS = 3;

export interface SubscriptionLike {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  updatedAt?: Date;
}

/** Estado efetivo na data `now` (expira trial e períodos vencidos sem depender de job). */
export function effectiveStatus(s: SubscriptionLike, now = new Date()): SubscriptionStatus {
  const st = s.status as SubscriptionStatus;
  if (st === "TRIALING" && s.trialEndsAt && now > s.trialEndsAt) return "EXPIRED";
  if (st === "CANCELLED" && (!s.currentPeriodEnd || now > s.currentPeriodEnd)) return "EXPIRED";
  if (st === "ACTIVE" && s.currentPeriodEnd && now.getTime() > s.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000) return "PAST_DUE";
  return st;
}

export function tierFor(s: SubscriptionLike | null, role: string, now = new Date()): Tier {
  if (role === "ADMIN") return "ADMIN";
  if (!s) return "NONE";
  const st = effectiveStatus(s, now);
  if (st === "TRIALING") return "TRIAL";
  if (st === "ACTIVE" || st === "CANCELLED") return s.plan === "ELITE" ? "ELITE" : "PRO"; // cancelada mantém acesso até o fim do período
  if (st === "PAST_DUE" && s.currentPeriodEnd && now.getTime() <= s.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000) return s.plan === "ELITE" ? "ELITE" : "PRO";
  return "NONE";
}

/** Plano legado (User.plan) correspondente ao tier, usado pelos limites já existentes. */
export function legacyPlanFor(tier: Tier): "FREE" | "PRO" | "PLATINUM" {
  return tier === "ELITE" || tier === "ADMIN" ? "PLATINUM" : tier === "PRO" || tier === "TRIAL" ? "PRO" : "FREE";
}
