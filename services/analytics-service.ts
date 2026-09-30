import { getPrisma } from "@/database/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("analytics");

/**
 * Eventos de produto (funil e uso). Best-effort: falha de gravação nunca quebra a requisição.
 * Não grava IP, e-mail ou conteúdo livre — só nome do evento, userId/anonId e propriedades técnicas.
 */
export const ANALYTICS_EVENTS = [
  "signup",
  "trial_started",
  "login",
  "dashboard_view",
  "context_change",
  "analyst_open",
  "analyst_message",
  "analyst_action_alert",
  "strategy_created",
  "strategy_scan",
  "monitor_created",
  "monitor_event",
  "backtest_run",
  "checkout_started",
  "subscription_activated",
  "subscription_cancelled",
  "payment_failed",
  "plans_view",
  "onboarding_step",
  "password_reset_requested",
] as const;
export type AnalyticsName = (typeof ANALYTICS_EVENTS)[number];

export async function track(name: AnalyticsName, opts: { userId?: string | null; anonId?: string | null; props?: Record<string, string | number | boolean | null> } = {}) {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.analyticsEvent.create({ data: { name, userId: opts.userId ?? null, anonId: opts.anonId ?? null, props: opts.props ?? undefined } });
  } catch (err) {
    log.warn("evento não gravado", { name, error: (err as Error).message });
  }
}
