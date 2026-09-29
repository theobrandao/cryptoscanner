"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { trackClient } from "@/lib/analytics-client";
import type { AccessView } from "@/services/subscription-service";

interface SubPayload extends AccessView {
  billing: { provider: string; configured: boolean; prices: { PRO: number; ELITE: number }; currency: string };
}

const FEATURES: Record<"PRO" | "ELITE", string[]> = {
  PRO: [
    "Todas as ferramentas: Scanner, Agentes IA, Sentinela, Gráficos, Fibonacci, Carteira, Simulador e Jornada",
    "Sinais do modelo de rompimento validado fora da amostra (4H e 1D)",
    "Avançado: Análise completa, Scanner de setups, Derivativos (Binance, Bybit e OKX) e Gestão de risco",
    "5 monitores no servidor, 50 alertas, push e Telegram",
    "Construtor de estratégias: 10 estratégias",
    "Backtest de um timeframe com taxas, slippage e funding · 1 ano de histórico",
    "Análise por IA com números verificados: 100 consultas/dia",
  ],
  ELITE: [
    "Tudo do PRO",
    "Backtest multi-timeframe",
    "3 anos de histórico no backtest",
    "20 monitores, 200 alertas e 50 estratégias",
    "Análise por IA: 500 consultas/dia",
  ],
};

const STATUS_PT: Record<string, string> = { TRIALING: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCELLED: "Cancelada (acesso até o fim do período)", EXPIRED: "Teste encerrado", NONE: "Sem assinatura" };

export function PlansView() {
  const { user } = useSession();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data, mutate } = useSWR<SubPayload>(user ? "/api/billing/subscription" : null);
  const { data: pub } = useSWR<{ prices: { PRO: number; ELITE: number }; checkoutEnabled: boolean; trialDays: number }>("/api/billing/prices", { revalidateOnFocus: false });
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => {
    trackClient("plans_view");
  }, []);
  const prices = pub?.prices ?? data?.billing.prices ?? null;

  const checkout = async (plan: "PRO" | "ELITE") => {
    setBusy(plan);
    try {
      const r = await postJson<{ url: string }>("/api/billing/checkout", { plan });
      window.location.href = r.url;
    } catch (err) {
      toast({ title: "Não foi possível iniciar o pagamento", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await postJson("/api/billing/cancel", {});
      await mutate();
      toast({ title: "Renovação cancelada. O acesso continua até o fim do período pago.", variant: "success" });
    } catch (err) {
      toast({ title: "Falha ao cancelar", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell>
      <PageTitle title="Choose Your Plan" description="7 dias de teste completo. Depois, PRO ou ELITE. Sem plano gratuito; sua conta e configurações ficam salvas." />
      {params.get("checkout") === "return" ? <Alert variant="info" className="mb-4" title="Pagamento em processamento">A confirmação do Mercado Pago pode levar alguns minutos. Esta página atualiza sozinha.</Alert> : null}
      {data ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm">
          <span className="font-semibold">Sua assinatura:</span>
          <span>{data.tier === "ADMIN" ? "Administrador (acesso ELITE)" : `${data.plan} · ${STATUS_PT[data.status] ?? data.status}`}</span>
          {data.daysLeft != null ? <span className="text-warning">{data.daysLeft} dia(s) de teste restante(s)</span> : null}
          {data.currentPeriodEnd ? <span className="text-muted-foreground">período até {new Date(data.currentPeriodEnd).toLocaleDateString("pt-BR")}</span> : null}
          {data.status === "ACTIVE" && !data.cancelAtPeriodEnd ? (
            <button onClick={() => void cancel()} disabled={busy === "cancel"} className="ml-auto h-8 rounded-md border border-border px-3 text-xs hover:bg-muted">
              Cancelar renovação
            </button>
          ) : null}
        </div>
      ) : null}
      {pub && !pub.checkoutEnabled ? (
        <Alert variant="info" className="mb-4" title="Assinaturas em liberação">
          O teste de 7 dias está disponível. A contratação paga é liberada após a ativação do Mercado Pago e a publicação dos termos definitivos.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(["PRO", "ELITE"] as const).map((p) => {
          const current = data && data.plan === p && (data.status === "ACTIVE" || data.status === "CANCELLED");
          return (
            <section key={p} className={cn("flex flex-col rounded-xl border bg-card p-5", p === "ELITE" ? "border-primary/40" : "border-border")}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{p}</h2>
                {p === "PRO" ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Mais escolhido</span> : null}
              </div>
              <div className="mt-2">
                <span className="tabular text-3xl font-bold">{prices ? `R$ ${prices[p]}` : "—"}</span>
                <span className="text-sm text-muted-foreground"> /mês</span>
              </div>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                {FEATURES[p].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              {!user ? (
                <Link href="/registro?next=/planos" className="mt-5 flex h-10 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                  Começar teste de 7 dias
                </Link>
              ) : current ? (
                <span className="mt-5 flex h-10 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">Plano atual</span>
              ) : (
                <button
                  onClick={() => void checkout(p)}
                  disabled={!pub?.checkoutEnabled || busy !== null || data?.tier === "ADMIN"}
                  className={cn("mt-5 h-10 rounded-md text-sm font-semibold disabled:opacity-50", "bg-primary text-primary-foreground hover:brightness-110")}
                >
                  {busy === p ? "Abrindo Mercado Pago…" : `Assinar ${p}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Pagamento recorrente mensal via Mercado Pago (cartão). Cancelamento a qualquer momento; o acesso segue até o fim do período pago. Arrependimento em até 7 dias da primeira cobrança com reembolso integral (
        <Link href="/reembolso" className="underline">
          política
        </Link>
        ). Conteúdo técnico e educacional; não é recomendação de investimento.
      </p>
    </PageShell>
  );
}
