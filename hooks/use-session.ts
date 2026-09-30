"use client";

import useSWR from "swr";
import type { PlanDefinition, PlanKey } from "@/lib/plans";

export interface SessionData {
  user: { id: string; email: string; name: string; plan: PlanKey; role: "USER" | "ADMIN" } | null;
  plan?: PlanDefinition;
  telegramConnected?: boolean;
  access?: { tier: "TRIAL" | "PRO" | "ELITE" | "NONE" | "ADMIN" } | null;
}

/** Nome do acesso atual como o cliente vê (plano vendido, não a chave interna). */
export const TIER_LABEL: Record<string, string> = { TRIAL: "Teste grátis", PRO: "Plano PRO", ELITE: "Plano ELITE", NONE: "Sem plano ativo", ADMIN: "Administrador" };

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<SessionData>("/api/auth/me");
  return { user: data?.user ?? null, plan: data?.plan, telegramConnected: data?.telegramConnected ?? false, tier: data?.access?.tier ?? null, loading: isLoading, error, refresh: mutate };
}
