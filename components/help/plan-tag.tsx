import { PlanBadge } from "@/components/brand/plan-badge";
import { Badge } from "@/components/ui/badge";
import type { TutorialPlan } from "@/lib/content/tutorials";
import { cn } from "@/lib/utils";

/** Texto do acesso exigido (lido também por leitores de tela no cartão). */
export const PLAN_TEXT: Record<TutorialPlan, string> = {
  livre: "Aberto a todos, sem plano",
  conta: "Precisa estar com a conta aberta",
  pro: "No teste grátis, no PRO e no ELITE",
};

/** Selo do acesso: PRO usa o selo oficial do plano; aberto e com conta usam selos neutros (dourado só no ELITE). */
export function TutorialPlanTag({ plan, className }: { plan: TutorialPlan; className?: string }) {
  if (plan === "pro")
    return (
      <span className={cn("inline-flex", className)} title={PLAN_TEXT.pro}>
        <PlanBadge plan="PRO" />
        <span className="sr-only">: {PLAN_TEXT.pro}</span>
      </span>
    );
  return (
    <Badge variant={plan === "livre" ? "info" : "muted"} className={cn("h-5 normal-case tracking-normal", className)} title={PLAN_TEXT[plan]}>
      {plan === "livre" ? "Grátis" : "Com conta"}
    </Badge>
  );
}
