import { cn } from "@/lib/utils";

export type PlanBadgePlan = "TRIAL" | "PRO" | "ELITE" | "ADMIN" | "NONE";

/** Texto do selo: PRO e ELITE são os planos vendidos (a chave interna PLATINUM nunca aparece). */
export const PLAN_BADGE_LABEL: Record<PlanBadgePlan, string> = { TRIAL: "Teste grátis", PRO: "PRO", ELITE: "ELITE", ADMIN: "Administrador", NONE: "Sem plano" };

/**
 * Cores do design system (plans.pro.badge / plans.elite.badge) no tema escuro; no tema claro o texto escurece para manter
 * contraste AA. Dourado só no ELITE; PRO em azul; teste grátis em azul-informação; administrador e sem plano neutros.
 */
const TONE: Record<PlanBadgePlan, string> = {
  PRO: "border-[rgba(37,99,235,.35)] bg-[rgba(37,99,235,.08)] text-[#1D4ED8] dark:border-[rgba(59,130,246,.35)] dark:bg-[rgba(37,99,235,.12)] dark:text-[#60A5FA]",
  ELITE: "border-[rgba(185,137,50,.45)] bg-[rgba(244,196,96,.14)] text-[#7A5410] dark:border-[rgba(244,196,96,.40)] dark:bg-[rgba(244,196,96,.10)] dark:text-[var(--elite,#F4C460)]",
  TRIAL: "border-[rgba(3,105,161,.30)] bg-[rgba(56,189,248,.10)] text-[#075985] dark:border-[rgba(56,189,248,.35)] dark:bg-[rgba(56,189,248,.10)] dark:text-[#38BDF8]",
  ADMIN: "border-[rgba(71,85,105,.35)] bg-[rgba(148,163,184,.12)] text-[#334155] dark:border-[rgba(148,163,184,.35)] dark:bg-[rgba(148,163,184,.10)] dark:text-[#CBD5E1]",
  NONE: "border-[rgba(71,85,105,.30)] bg-transparent text-[#475569] dark:border-[rgba(148,163,184,.25)] dark:text-[#94A3B8]",
};

export function PlanBadge({ plan, className }: { plan: PlanBadgePlan; className?: string }) {
  const tier = plan === "PRO" || plan === "ELITE";
  return (
    <span data-plan={plan} className={cn("inline-flex h-5 w-fit shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold leading-none", tier && "tracking-[0.06em]", TONE[plan], className)}>
      {PLAN_BADGE_LABEL[plan]}
    </span>
  );
}
