"use client";

import useSWR from "swr";
import type { PlanDefinition, PlanKey } from "@/lib/plans";

export interface SessionData {
  user: { id: string; email: string; name: string; plan: PlanKey; role: "USER" | "ADMIN" } | null;
  plan?: PlanDefinition;
  telegramConnected?: boolean;
}

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<SessionData>("/api/auth/me");
  return { user: data?.user ?? null, plan: data?.plan, telegramConnected: data?.telegramConnected ?? false, loading: isLoading, error, refresh: mutate };
}
