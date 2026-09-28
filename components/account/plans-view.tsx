"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, postJson } from "@/lib/client-api";
import type { PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface PlansPayload {
  plans: Array<{ key: PlanKey; name: string; timeframes: string[]; imageAnalysesPerDay: number | null; maxAgents: number; telegramAlerts: boolean; benefits: string[] }>;
  selfChangeAllowed: boolean;
  billing: string;
}

/** REIMPLEMENTAÇÃO NECESSÁRIA: sem cobrança integrada. Em ambiente de teste o usuário troca o próprio plano. */
export function PlansView() {
  const { data } = useSWR<PlansPayload>("/api/plans");
  const { user, refresh } = useSession();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<PlanKey | null>(null);
  const change = async (plan: PlanKey) => {
    setBusy(plan);
    try {
      await postJson("/api/plans/change", { plan });
      await refresh();
      toast({ title: `Plano alterado para ${plan}`, variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível alterar", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <PageShell>
      <PageTitle icon="💳" title="Planos" description="Limites por plano. Os valores de FREE e PRO são deste projeto; PLATINUM reproduz os benefícios públicos da referência." />
      <Alert variant="info" title="Sem cobrança integrada">
        Este projeto não processa pagamentos.{" "}
        {data?.selfChangeAllowed ? "Neste ambiente você pode alternar o próprio plano para testar os recursos." : "A troca de plano está restrita ao administrador."} Integre um provedor de pagamento
        (Stripe, Pagar.me…) e desative ALLOW_SELF_PLAN_CHANGE em produção.
      </Alert>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(data?.plans ?? []).map((p) => {
          const current = user?.plan === p.key;
          return (
            <Card key={p.key} className={cn(p.key === "PLATINUM" && "border-accent/50", current && "ring-2 ring-primary")}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {p.key === "PLATINUM" ? "💎 " : ""}
                  {p.name}
                  {current ? <Badge>atual</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col gap-1 text-sm">
                  {p.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-success" /> {b}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4" /> Timeframes: {p.timeframes.map((t) => t.toUpperCase()).join(", ")}
                  </li>
                  <li className="flex items-start gap-2 text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4" /> Análises de imagem/dia: {p.imageAnalysesPerDay ?? "ilimitadas"}
                  </li>
                </ul>
                {!user ? (
                  <Link href="/registro" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                    Criar conta
                  </Link>
                ) : current ? (
                  <Button variant="secondary" disabled>
                    Plano atual
                  </Button>
                ) : (
                  <Button onClick={() => void change(p.key)} loading={busy === p.key} disabled={!data?.selfChangeAllowed && user.role !== "ADMIN"}>
                    Mudar para {p.name}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
