"use client";

import * as React from "react";
import useSWR from "swr";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSession } from "@/hooks/use-session";
import { apiFetch } from "@/lib/client-api";

export type ProgressEntry = { done: boolean; score: number; at: string };
export type ProgressMap = Record<string, ProgressEntry>;
export type SaveStatus = "saving" | "ok" | "error";

/**
 * Progresso da Jornada: fica no navegador (cs-learning) e, com conta, também é sincronizado pelo /api/learning.
 * Várias instâncias do hook compartilham o mesmo estado (localStorage sincronizado e SWR deduplicado).
 */
export function useLearningProgress() {
  const { user } = useSession();
  const [local, setLocal] = useLocalStorage<ProgressMap>("cs-learning", {});
  const { data: remote, mutate } = useSWR<{ progress: ProgressMap }>(user ? "/api/learning" : null);
  const progress: ProgressMap = React.useMemo(() => ({ ...local, ...(remote?.progress ?? {}) }), [local, remote]);
  const [save, setSave] = React.useState<{ slug: string; status: SaveStatus; entry: ProgressEntry } | null>(null);

  const pushRemote = React.useCallback(
    async (slug: string, entry: ProgressEntry) => {
      setSave({ slug, status: "saving", entry });
      try {
        await apiFetch("/api/learning", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress: { [slug]: entry } }) });
        setSave({ slug, status: "ok", entry });
        await mutate();
      } catch {
        setSave({ slug, status: "error", entry });
      }
    },
    [mutate],
  );

  const complete = React.useCallback(
    async (slug: string, score: number) => {
      const entry = { done: true, score, at: new Date().toISOString() };
      setLocal((p) => ({ ...p, [slug]: entry }));
      if (user) await pushRemote(slug, entry);
    },
    [setLocal, user, pushRemote],
  );

  const retrySave = React.useCallback(() => {
    if (save) void pushRemote(save.slug, save.entry);
  }, [save, pushRemote]);

  return { loggedIn: !!user, progress, save, complete, retrySave };
}
