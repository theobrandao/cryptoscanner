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
  // funil de conversão (emitidos pelo cliente via trackClient → POST /api/analytics/event)
  "cta_click",
  "signup_view",
  "gate_view",
  "trial_card_click",
  "cancel_reason",
] as const;
export type AnalyticsName = (typeof ANALYTICS_EVENTS)[number];

/**
 * Eventos que o navegador pode enviar (trackClient). Para os eventos de conversão, só as propriedades listadas
 * em CLIENT_EVENT_PROPS são gravadas (as demais são descartadas); valores são textos curtos, números ou booleanos.
 *  - cta_click        { origin, plan?, target? }  clique em chamada para ação; origin: hero | cartao_ferramenta | rodape | fixo_celular | final | …
 *  - signup_view      { origin?, next?, plan? }   tela de cadastro aberta
 *  - gate_view        { feature, state?, need? }  tela de bloqueio exibida; state: visitante | sem_plano | elite
 *  - trial_card_click { origin?, day?, level? }   clique no cartão do teste grátis
 *  - onboarding_step  { step, action? }           passo dos primeiros passos concluído/aberto
 *  - cancel_reason    { reason, plan?, provider? } motivo opcional do cancelamento; reason: um de CANCEL_REASONS
 */
export const CLIENT_ANALYTICS_EVENTS = ["dashboard_view", "context_change", "analyst_open", "analyst_message", "analyst_action_alert", "plans_view", "onboarding_step", "strategy_scan", "cta_click", "signup_view", "gate_view", "trial_card_click", "cancel_reason"] as const satisfies readonly AnalyticsName[];
export type ClientAnalyticsName = (typeof CLIENT_ANALYTICS_EVENTS)[number];

export const CLIENT_EVENT_PROPS: Partial<Record<ClientAnalyticsName, readonly string[]>> = {
  cta_click: ["origin", "plan", "target"],
  signup_view: ["origin", "next", "plan"],
  gate_view: ["feature", "state", "need"],
  trial_card_click: ["origin", "day", "level"],
  onboarding_step: ["step", "action"],
  cancel_reason: ["reason", "plan", "provider"],
};

/** Motivos de cancelamento aceitos no evento cancel_reason (texto exibido fica na tela de planos). */
export const CANCEL_REASONS = ["preco", "pouco_uso", "falta_recurso", "problema_tecnico", "outra_ferramenta", "outro"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

type PropValue = string | number | boolean | null;

/**
 * Filtra as propriedades de um evento do cliente: eventos de conversão só mantêm as chaves permitidas;
 * cancel_reason exige um motivo da lista e gate_view uma ferramenta. `ok: false` quando o evento deve ser recusado.
 */
export function sanitizeClientProps(name: ClientAnalyticsName, props: Record<string, PropValue> | undefined): { ok: true; props: Record<string, PropValue> | undefined } | { ok: false } {
  const allowed = CLIENT_EVENT_PROPS[name];
  let out = props && Object.keys(props).length <= 8 ? props : undefined;
  if (allowed && out) out = Object.fromEntries(Object.entries(out).filter(([k]) => allowed.includes(k)));
  if (out && !Object.keys(out).length) out = undefined;
  if (name === "cancel_reason" && !(typeof out?.reason === "string" && (CANCEL_REASONS as readonly string[]).includes(out.reason))) return { ok: false };
  if (name === "gate_view" && !(typeof out?.feature === "string" && out.feature.trim())) return { ok: false };
  return { ok: true, props: out };
}

export async function track(name: AnalyticsName, opts: { userId?: string | null; anonId?: string | null; props?: Record<string, string | number | boolean | null> } = {}) {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.analyticsEvent.create({ data: { name, userId: opts.userId ?? null, anonId: opts.anonId ?? null, props: opts.props ?? undefined } });
  } catch (err) {
    log.warn("evento não gravado", { name, error: (err as Error).message });
  }
}
