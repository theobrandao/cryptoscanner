"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, CreditCard, LifeBuoy, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { trackClient } from "@/lib/analytics-client";
import { PAST_DUE_GRACE_DAYS } from "@/lib/entitlements";
import { billingNote, formatBRL, PLAN_FEATURES, PROVIDER_LABEL, SUPPORT_PATHS, type BillingProvider } from "@/lib/plans-copy";
import type { AccessView } from "@/services/subscription-service";
import { withAffiliateParams } from "@/lib/affiliate-params";
import type { PublicPrices } from "@/lib/billing/public-prices";
import { CheckoutReturnNotice } from "@/components/account/plans/checkout-return-notice";
import { CancelDialog } from "@/components/account/plans/cancel-dialog";
import { SavedSummary, type SavedCounts } from "@/components/account/plans/saved-summary";
import { ELITE_BORDER, ELITE_CTA, ELITE_TEXT, EliteBadge, PREMIUM_CTA, ProBadge } from "@/components/account/plan-tier";

interface SubPayload extends AccessView {
  billing: { provider: BillingProvider; configured: boolean; prices: { PRO: number; ELITE: number }; currency: string };
  saved?: SavedCounts | null;
}

export type { PublicPrices };

const STATUS_PT: Record<string, string> = { TRIALING: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCELLED: "Cancelada (acesso até o fim do período)", EXPIRED: "Sem acesso ativo", NONE: "Sem assinatura" };
const dateBR = (d: string | Date) => new Date(d).toLocaleDateString("pt-BR");
const providerPlace = (p: string | null | undefined) => (p === "kiwify" ? "na Kiwify" : p === "mercadopago" ? "no Mercado Pago" : null);

/** Estado da conta que muda a página: teste/assinatura encerrados, pagamento pendente, cancelada com período restante. */
function pageState(data: SubPayload | undefined) {
  if (!data || data.tier === "ADMIN") return { ended: false, endedPaid: false, trialUsed: false, pastDue: false, cancelledWithPeriod: false };
  const trialUsed = data.status !== "TRIALING" && (data.trialEndsAt != null || data.provider != null);
  const ended = data.status === "EXPIRED" || (data.status === "NONE" && data.trialEndsAt != null);
  const cancelledWithPeriod = data.status === "CANCELLED" && data.currentPeriodEnd != null && new Date(data.currentPeriodEnd).getTime() > Date.now();
  return { ended, endedPaid: ended && data.provider != null, trialUsed, pastDue: data.status === "PAST_DUE", cancelledWithPeriod };
}

/**
 * Página de planos. Título, cartões e preços chegam prontos do servidor (`initial`, de PRICE_*_BRL);
 * o que depende da conta (assinatura, avisos) entra depois num espaço já reservado.
 */
export function PlansView({ initial, faq }: { initial: PublicPrices; faq?: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const { toast } = useToast();
  const { data, mutate } = useSWR<SubPayload>(user ? "/api/billing/subscription?saved=1" : null);
  const { data: pubData } = useSWR<PublicPrices>("/api/billing/prices", { revalidateOnFocus: false, fallbackData: initial });
  const pub = pubData ?? initial;
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => {
    trackClient("plans_view");
  }, []);
  const prices = pub.prices;
  const provider: BillingProvider = pub.provider;
  const via = PROVIDER_LABEL[provider];
  const trial = pub.trialDays;
  const st = pageState(data);

  const checkout = async (plan: "PRO" | "ELITE") => {
    trackClient("cta_click", { origin: "planos", plan });
    setBusy(plan);
    try {
      const r = await postJson<{ url: string }>("/api/billing/checkout", { plan });
      window.location.href = withAffiliateParams(r.url);
    } catch {
      toast({ title: "Não foi possível iniciar o pagamento. Tente novamente.", variant: "danger" });
      setBusy(null);
    }
  };

  const title = st.ended ? "Escolha o plano para voltar de onde parou" : "Planos";
  const description = st.ended ? "Sua conta continua aqui. Escolha PRO ou ELITE para voltar a usar as ferramentas." : st.trialUsed ? "PRO ou ELITE, pagamento mensal. Sua conta e configurações ficam salvas." : `${trial} dias grátis no PRO, sem cartão. Depois, PRO ou ELITE. Sua conta e configurações ficam salvas.`;

  return (
    <PageShell>
      {st.ended ? (
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {st.endedPaid ? "Sua assinatura terminou" : "Seu teste terminou"}
        </span>
      ) : null}
      <PageTitle title={title} description={description} />
      {st.pastDue && data ? (
        <Alert
          variant="warning"
          className="mb-4"
          title={`Pagamento pendente — atualize o pagamento${providerPlace(data.provider) ? ` ${providerPlace(data.provider)}` : ""}`}
          action={
            <Link href={SUPPORT_PATHS.payment} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-muted">
              <LifeBuoy className="h-4 w-4" aria-hidden /> Falar com o suporte
            </Link>
          }
        >
          A última cobrança do {data.plan} não foi aprovada.
          {data.currentPeriodEnd ? ` Seu acesso continua até ${dateBR(new Date(new Date(data.currentPeriodEnd).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000))} enquanto o pagamento é regularizado.` : ""} Se precisar de ajuda, fale com o suporte.
        </Alert>
      ) : null}
      <React.Suspense fallback={null}>
        <CheckoutReturnNotice via={via} />
      </React.Suspense>
      {/* espaço reservado: a mesma caixa para visitante, carregamento e assinante (sem salto de layout) */}
      <div className="mb-4 flex min-h-[4.25rem] flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-4 text-sm">
        {data ? (
          <>
            <span className="font-semibold">Sua assinatura:</span>
            <span>{data.tier === "ADMIN" ? "Administrador (acesso ELITE)" : `${data.plan} · ${STATUS_PT[data.status] ?? data.status}`}</span>
            {data.daysLeft != null ? <span className="text-warning">{data.daysLeft} dia(s) de teste restante(s)</span> : null}
            {data.currentPeriodEnd && !st.ended ? <span className="text-muted-foreground">período até {dateBR(data.currentPeriodEnd)}</span> : null}
            {data.status === "ACTIVE" && !data.cancelAtPeriodEnd && data.tier !== "ADMIN" && data.provider ? <CancelDialog plan={data.plan} provider={data.provider} currentPeriodEnd={data.currentPeriodEnd} onCancelled={() => mutate()} /> : null}
            {st.cancelledWithPeriod ? (
              <Link href={SUPPORT_PATHS.reactivate} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted sm:ml-auto">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reativar renovação
              </Link>
            ) : null}
            {st.ended ? <SavedSummary saved={data.saved} /> : null}
          </>
        ) : user || sessionLoading ? (
          <span className="skeleton h-5 w-64 max-w-full rounded" aria-busy="true" aria-label="Carregando sua assinatura" />
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {trial} dias grátis no PRO, sem cartão
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-primary" aria-hidden /> Cancele quando quiser
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Arrependimento em até 7 dias com reembolso integral
            </li>
          </ul>
        )}
      </div>
      {!pub.checkoutEnabled ? (
        <Alert variant="info" className="mb-4" title="Assinaturas em liberação">
          O teste grátis de {trial} dias do PRO está disponível. A contratação paga é liberada após a ativação do pagamento e a publicação dos termos definitivos.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(["PRO", "ELITE"] as const).map((p) => {
          const current = data && data.plan === p && (data.status === "ACTIVE" || data.status === "CANCELLED" || data.status === "PAST_DUE");
          const directUrl = pub.checkoutUrls?.[p] ?? null;
          const highlight = p === "PRO" && st.ended;
          const badge =
            p === "ELITE" ? (
              <EliteBadge className="normal-case tracking-normal">Mais recursos</EliteBadge>
            ) : st.ended && !st.endedPaid ? (
              <ProBadge className="normal-case tracking-normal">Plano do seu teste</ProBadge>
            ) : data?.status === "TRIALING" ? (
              <ProBadge className="normal-case tracking-normal">Em teste agora</ProBadge>
            ) : st.trialUsed ? null : (
              <ProBadge className="normal-case tracking-normal">{trial} dias grátis</ProBadge>
            );
          return (
            <section key={p} className={cn("flex flex-col rounded-xl border bg-card p-5", highlight ? "border-primary ring-2 ring-primary/40" : p === "ELITE" ? ELITE_BORDER : "border-border")}>
              <div className="flex min-h-6 items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{p}</h2>
                {badge}
              </div>
              <div className="mt-2">
                <span className="tabular text-3xl font-bold">{formatBRL(prices[p])}</span>
                <span className="text-sm text-muted-foreground"> /mês</span>
              </div>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                {PLAN_FEATURES[p].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", p === "ELITE" ? ELITE_TEXT : "text-primary")} aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              {!user ? (
                p === "PRO" ? (
                  <Link href="/registro?next=/planos" onClick={() => trackClient("cta_click", { origin: "planos", plan: "PRO" })} className={cn("mt-5 flex h-11 items-center justify-center rounded-md text-sm font-semibold", PREMIUM_CTA)}>
                    Começar {trial} dias grátis
                  </Link>
                ) : directUrl ? (
                  <a
                    href={directUrl}
                    rel="noopener"
                    onClick={(e) => {
                      trackClient("cta_click", { origin: "planos", plan: "ELITE" });
                      e.currentTarget.href = withAffiliateParams(directUrl);
                    }}
                    className={cn("mt-5 flex h-11 items-center justify-center rounded-md text-sm font-semibold", ELITE_CTA)}
                  >
                    Assinar ELITE
                  </a>
                ) : (
                  <Link href="/registro?next=/planos" className={cn("mt-5 flex h-11 items-center justify-center rounded-md border text-sm font-semibold hover:bg-muted", ELITE_BORDER)}>
                    Criar conta
                  </Link>
                )
              ) : current && data?.status === "PAST_DUE" ? (
                <Link href={SUPPORT_PATHS.payment} className="mt-5 flex h-11 items-center justify-center gap-2 rounded-md border border-warning/60 text-sm font-semibold text-foreground hover:bg-warning/10">
                  <LifeBuoy className="h-4 w-4" aria-hidden /> Resolver pagamento
                </Link>
              ) : current ? (
                <span className="mt-5 flex h-11 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">Plano atual</span>
              ) : (
                <button
                  onClick={() => void checkout(p)}
                  disabled={!pub.checkoutEnabled || busy !== null || data?.tier === "ADMIN"}
                  className={cn("mt-5 h-11 rounded-md text-sm font-semibold disabled:opacity-50", st.ended && p === "ELITE" ? cn("border hover:bg-muted cursor-pointer", ELITE_BORDER) : p === "ELITE" ? ELITE_CTA : PREMIUM_CTA)}
                >
                  {busy === p ? "Abrindo o pagamento…" : `Assinar ${p}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {user && provider === "kiwify" && pub.checkoutEnabled ? (
        <Alert variant="info" className="mt-4" title="Use o mesmo e-mail na compra">
          O acesso é liberado automaticamente para a conta com o e-mail usado no checkout da Kiwify: <strong>{user.email}</strong>.
        </Alert>
      ) : null}
      {faq}
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
