"use client";

import * as React from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/entitlements";
import useSWR from "swr";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import type { AccessView } from "@/services/subscription-service";

export interface AccessPayload extends AccessView {
  billing: { provider: string; configured: boolean; prices: { PRO: number; ELITE: number }; currency: string };
}

/** Acesso efetivo (decidido no servidor). `null` enquanto carrega ou sem sessão. */
export function useAccess() {
  const { user, loading } = useSession();
  const { data, isLoading } = useSWR<AccessPayload>(user ? "/api/billing/subscription" : null, { revalidateOnFocus: false });
  return { user, access: data ?? null, loading: loading || (Boolean(user) && isLoading) };
}

/**
 * Portão de acesso das páginas do produto: sem sessão → teste grátis do PRO/entrar; sem plano → escolher plano;
 * recurso ELITE → upgrade. O backend repete a mesma verificação em cada rota.
 */
export function AccessGate({ need = "core", feature, children }: { need?: "core" | "elite"; feature: string; children: React.ReactNode }) {
  const { user, access, loading } = useAccess();
  const path = usePathname();
  const next = encodeURIComponent(path ?? "/");
  if (loading) return <div className="skeleton m-4 h-64 rounded-lg" aria-busy="true" />;
  if (!user)
    return (
      <Gate title={feature} text={`Disponível no teste grátis de ${TRIAL_DAYS} dias e nos planos PRO e ELITE.`}>
        <Link href={`/registro?next=${next}`} className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Start 7-day trial
        </Link>
        <Link href={`/login?next=${next}`} className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm">
          Entrar
        </Link>
      </Gate>
    );
  if (!access) return <div className="skeleton m-4 h-64 rounded-lg" aria-busy="true" />;
  if (!access.entitlements.core)
    return (
      <Gate title="Escolha seu plano" text="Seu período de teste terminou. Sua conta, watchlists, estratégias e monitores continuam salvos.">
        <Link href="/planos" className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          View Plans
        </Link>
      </Gate>
    );
  if (need === "elite" && !access.entitlements.elite)
    return (
      <Gate title={`${feature} — ELITE`} text="Este recurso faz parte do plano ELITE.">
        <Link href="/planos" className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          View Plans
        </Link>
      </Gate>
    );
  return <>{children}</>;
}

function Gate({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <div className="mt-5 flex justify-center gap-2">{children}</div>
    </div>
  );
}
