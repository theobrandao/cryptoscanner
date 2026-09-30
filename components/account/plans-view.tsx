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
import { billingNote, PLAN_FEATURES, PROVIDER_LABEL, type BillingProvider } from "@/lib/plans-copy";
import type { AccessView } from "@/services/subscription-service";
import { withAffiliateParams } from "@/lib/affiliate-params";

interface SubPayload extends AccessView {
  billing: { provider: BillingProvider; configured: boolean; prices: { PRO: number; ELITE: number }; currency: string };
}

export interface PublicPrices {
  prices: { PRO: number; ELITE: number };
  checkoutEnabled: boolean;
  trialDays: number;
  provider: BillingProvider;
  checkoutUrls: { PRO: string | null; ELITE: string | null } | null;
}

const STATUS_PT: Record<string, string> = { TRIALING: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCELLED: "Cancelada (acesso até o fim do período)", EXPIRED: "Sem acesso ativo", NONE: "Sem assinatura" };

export function PlansView() {
  const { user } = useSession();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data, mutate } = useSWR<SubPayload>(user ? "/api/billing/subscription" : null);
  const { data: pub } = useSWR<PublicPrices>("/api/billing/prices", { revalidateOnFocus: false });
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => {
    trackClient("plans_view");
  }, []);
  const prices = pub?.prices ?? data?.billing.prices ?? null;
  const provider: BillingProvider = pub?.provider ?? data?.billing.provider ?? "mercadopago";
  const via = PROVIDER_LABEL[provider];
  const trial = pub?.trialDays ?? data?.trialDays ?? 3;

  const checkout = async (plan: "PRO" | "ELITE") => {
    setBusy(plan);
    try {
      const r = await postJson<{ url: string }>("/api/billing/checkout", { plan });
      window.location.href = withAffiliateParams(r.url);
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
      <PageTitle title="Planos" description={`${trial} dias grátis no PRO, sem cartão. Depois, PRO ou ELITE. Sua conta e configurações ficam salvas.`} />
      {params.get("checkout") === "return" ? (
        <Alert variant="info" className="mb-4" title="Pagamento em processamento">
          A confirmação da {via} pode levar alguns minutos. Esta página atualiza sozinha.
        </Alert>
      ) : null}
      {data ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-4 text-sm">
          <span className="font-semibold">Sua assinatura:</span>
          <span>{data.tier === "ADMIN" ? "Administrador (acesso ELITE)" : `${data.plan} · ${STATUS_PT[data.status] ?? data.status}`}</span>
          {data.daysLeft != null ? <span className="text-warning">{data.daysLeft} dia(s) de teste restante(s)</span> : null}
          {data.currentPeriodEnd ? <span className="text-muted-foreground">período até {new Date(data.currentPeriodEnd).toLocaleDateString("pt-BR")}</span> : null}
          {data.status === "ACTIVE" && !data.cancelAtPeriodEnd ? (
            data.provider === "kiwify" ? (
              <span className="text-xs text-muted-foreground sm:ml-auto">Compra pela Kiwify: cancelamento pelo e-mail da compra ou pelo suporte.</span>
            ) : (
              <button onClick={() => void cancel()} disabled={busy === "cancel"} className="h-9 rounded-md border border-border px-3 text-xs hover:bg-muted sm:ml-auto">
                Cancelar renovação
              </button>
            )
          ) : null}
        </div>
      ) : null}
      {pub && !pub.checkoutEnabled ? (
        <Alert variant="info" className="mb-4" title="Assinaturas em liberação">
          O teste grátis de {trial} dias do PRO está disponível. A contratação paga é liberada após a ativação da {via} e a publicação dos termos definitivos.
        </Alert>
      ) : null}
      {user && provider === "kiwify" && pub?.checkoutEnabled ? (
        <Alert variant="info" className="mb-4" title="Use o mesmo e-mail na compra">
          O acesso é liberado automaticamente para a conta com o e-mail usado no checkout da Kiwify: <strong>{user.email}</strong>.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(["PRO", "ELITE"] as const).map((p) => {
          const current = data && data.plan === p && (data.status === "ACTIVE" || data.status === "CANCELLED");
          const directUrl = pub?.checkoutUrls?.[p] ?? null;
          return (
            <section key={p} className={cn("flex flex-col rounded-xl border bg-card p-5", p === "ELITE" ? "border-primary/40" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{p}</h2>
                {p === "PRO" ? <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">{trial} dias grátis</span> : <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Mais recursos</span>}
              </div>
              <div className="mt-2">
                <span className="tabular text-3xl font-bold">{prices ? `R$ ${prices[p]}` : "—"}</span>
                <span className="text-sm text-muted-foreground"> /mês</span>
              </div>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                {PLAN_FEATURES[p].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              {!user ? (
                p === "PRO" ? (
                  <Link href="/registro?next=/planos" className="mt-5 flex h-11 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    Começar {trial} dias grátis
                  </Link>
                ) : directUrl ? (
                  <a href={directUrl} rel="noopener" onClick={(e) => (e.currentTarget.href = withAffiliateParams(directUrl))} className="mt-5 flex h-11 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    Assinar ELITE
                  </a>
                ) : (
                  <Link href="/registro?next=/planos" className="mt-5 flex h-11 items-center justify-center rounded-md border border-border text-sm font-semibold">
                    Criar conta
                  </Link>
                )
              ) : current ? (
                <span className="mt-5 flex h-11 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">Plano atual</span>
              ) : (
                <button
                  onClick={() => void checkout(p)}
                  disabled={!pub?.checkoutEnabled || busy !== null || data?.tier === "ADMIN"}
                  className="mt-5 h-11 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {busy === p ? `Abrindo ${via}…` : `Assinar ${p}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {billingNote(provider)} (
        <Link href="/reembolso" className="underline">
          política
        </Link>
        ). Conteúdo técnico e educacional; não é recomendação de investimento.
      </p>
    </PageShell>
  );
}
