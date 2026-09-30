"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Gem, Lock, RotateCw } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/entitlements";
import useSWR from "swr";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { trackClient } from "@/lib/analytics-client";
import { formatBRL, gateCopy } from "@/lib/plans-copy";
import type { AccessView } from "@/services/subscription-service";

export interface AccessPayload extends AccessView {
  billing: { provider: string; configured: boolean; prices: { PRO: number; ELITE: number }; currency: string };
}

/** Acesso efetivo (decidido no servidor). `null` enquanto carrega ou sem sessão; `error` quando a consulta falhou. */
export function useAccess() {
  const { user, loading } = useSession();
  const { data, error, isLoading, mutate } = useSWR<AccessPayload>(user ? "/api/billing/subscription" : null, { revalidateOnFocus: false });
  return { user, access: data ?? null, error: data ? undefined : (error as unknown), retry: () => void mutate(), loading: loading || (Boolean(user) && isLoading) };
}

type GateState = "visitante" | "sem_plano" | "elite";

/** Registra a exibição do bloqueio uma vez por ferramenta/estado (evento gate_view). */
function useGateView(feature: string, state: GateState | null) {
  React.useEffect(() => {
    if (state) trackClient("gate_view", { feature: feature.slice(0, 60), state });
  }, [feature, state]);
}

const primaryBtn = "inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground";
const secondaryBtn = "inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-5 text-sm";

/**
 * Portão de acesso das páginas do produto: sem sessão → teste grátis do PRO/entrar/Jornada grátis; sem plano → escolher plano;
 * recurso ELITE → upgrade (sem teste). Cada tela diz o que a ferramenta faz e o preço. O backend repete a mesma verificação em cada rota.
 */
export function AccessGate({ need = "core", feature, children }: { need?: "core" | "elite"; feature: string; children: React.ReactNode }) {
  const { user, access, error, retry, loading } = useAccess();
  const path = usePathname();
  const next = encodeURIComponent(path ?? "/");
  const copy = gateCopy(feature);
  // visitante não tem /api/billing/subscription: os preços públicos vêm de /api/billing/prices
  const { data: pub } = useSWR<{ prices: { PRO: number; ELITE: number } }>(!loading && !user ? "/api/billing/prices" : null, { revalidateOnFocus: false });
  const state: GateState | null = loading ? null : !user ? "visitante" : !access ? null : !access.entitlements.core ? "sem_plano" : need === "elite" && !access.entitlements.elite ? "elite" : null;
  useGateView(copy.title, state);
  if (loading) return <div className="skeleton m-4 h-64 rounded-lg" aria-busy="true" />;
  if (!user) {
    const pro = pub?.prices.PRO;
    return (
      <Gate title={copy.title} benefit={copy.benefit} text={`Disponível no teste grátis de ${TRIAL_DAYS} dias do PRO, sem cartão, e nos planos PRO e ELITE.`} price={pro != null ? `Depois do teste, a partir de ${formatBRL(pro)}/mês. Cancele quando quiser.` : null}>
        <Link href={`/registro?next=${next}`} onClick={() => trackClient("cta_click", { origin: "bloqueio", target: "registro" })} className={primaryBtn}>
          Testar {TRIAL_DAYS} dias grátis
        </Link>
        <Link href={`/login?next=${next}`} className={secondaryBtn}>
          Entrar
        </Link>
        <Link href="/jornada" onClick={() => trackClient("cta_click", { origin: "bloqueio", target: "jornada" })} className={secondaryBtn}>
          <BookOpen className="h-4 w-4" aria-hidden /> Ver a Jornada grátis
        </Link>
      </Gate>
    );
  }
  if (!access) {
    if (error)
      return (
        <Gate title="Não foi possível verificar seu acesso" text="Verifique a conexão e tente de novo.">
          <button type="button" onClick={retry} className={primaryBtn}>
            <RotateCw className="h-4 w-4" aria-hidden /> Tentar novamente
          </button>
        </Gate>
      );
    return <div className="skeleton m-4 h-64 rounded-lg" aria-busy="true" />;
  }
  const prices = access.billing.prices;
  if (!access.entitlements.core)
    return (
      <Gate title={copy.title} benefit={copy.benefit} text="Esta ferramenta faz parte dos planos PRO e ELITE. Sua conta, favoritos, estratégias e monitores continuam salvos." price={`A partir de ${formatBRL(prices.PRO)}/mês. Cancele quando quiser.`}>
        <Link href="/planos" onClick={() => trackClient("cta_click", { origin: "bloqueio", target: "planos" })} className={primaryBtn}>
          Ver planos
        </Link>
        <Link href="/jornada" className={secondaryBtn}>
          <BookOpen className="h-4 w-4" aria-hidden /> Ver a Jornada grátis
        </Link>
      </Gate>
    );
  if (need === "elite" && !access.entitlements.elite)
    return (
      <Gate
        icon="elite"
        title={`${copy.title} — ELITE`}
        benefit={copy.benefit}
        text={`Este recurso faz parte do plano ELITE, que não tem teste grátis. ${access.tier === "TRIAL" ? "Seu teste do PRO" : "Seu plano PRO"} continua igual.`}
        price={`${formatBRL(prices.ELITE)}/mês. Cancele quando quiser.`}
      >
        <Link href="/planos" onClick={() => trackClient("cta_click", { origin: "bloqueio_elite", target: "planos", plan: "ELITE" })} className={primaryBtn}>
          <Gem className="h-4 w-4" aria-hidden /> Ver plano ELITE
        </Link>
      </Gate>
    );
  return <>{children}</>;
}

function Gate({ title, benefit, text, price, icon = "lock", children }: { title: string; benefit?: string; text: string; price?: string | null; icon?: "lock" | "elite"; children: React.ReactNode }) {
  const Icon = icon === "elite" ? Gem : Lock;
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
      <span aria-hidden className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h1 className="text-xl font-bold">{title}</h1>
      {benefit ? <p className="mt-2 text-sm font-medium">{benefit}</p> : null}
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      {price !== undefined ? <p className="mt-3 min-h-5 text-sm font-semibold tabular">{price ?? ""}</p> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}
