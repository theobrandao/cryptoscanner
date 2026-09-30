import { TIER_LIMITS, TIERS, timeframesFor, hasCore, hasElite, type Tier } from "@/lib/access-policy";

/**
 * Entitlements — decididos no BACKEND a partir da assinatura (nunca pelo frontend).
 * Tiers: TRIAL (≈ PRO por TRIAL_DAYS dias), PRO, ELITE, NONE (trial expirado/cancelado sem período ativo), ADMIN (dono).
 * Timeframes, recursos e limites vêm da regra única em `lib/access-policy.ts`.
 */
export type { Tier } from "@/lib/access-policy";
export { legacyPlanFor } from "@/lib/access-policy";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export interface Entitlements {
  tier: Tier;
  /** terminal, scanner, monitor, alertas, risco, AI analyst */
  core: boolean;
  /** backtest avançado/multi-TF, replay, estratégias avançadas, portfolio risk avançado, timeframes abaixo de 4H */
  elite: boolean;
  timeframes: string[];
  maxAlerts: number;
  maxMonitors: number;
  maxStrategies: number;
  aiQueriesPerDay: number;
  historyDays: number;
}

export const ENTITLEMENTS: Record<Tier, Entitlements> = Object.fromEntries(
  TIERS.map((tier) => [tier, { tier, core: hasCore(tier), elite: hasElite(tier), timeframes: timeframesFor(tier), ...TIER_LIMITS[tier] }]),
) as Record<Tier, Entitlements>;

/** Teste grátis: só do plano PRO, sem cartão. */
export const TRIAL_DAYS = 3;
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
