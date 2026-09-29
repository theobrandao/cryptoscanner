"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, X } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface Onboarding {
  dismissed: boolean;
  done: number;
  steps: Array<{ key: string; label: string; done: boolean; href: string }>;
}

/** Primeiros passos (derivados do uso real da conta). Some quando concluído ou dispensado. */
export function OnboardingCard() {
  const { data, mutate } = useSWR<Onboarding>("/api/onboarding", { revalidateOnFocus: true });
  if (!data || data.dismissed || data.done === data.steps.length) return null;
  const dismiss = async () => {
    await apiFetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
    await mutate();
  };
  return (
    <section className="rounded-lg border border-border bg-card p-3" aria-label="Primeiros passos">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">
          Primeiros passos · {data.done}/{data.steps.length}
        </h2>
        <button onClick={() => void dismiss()} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label="Dispensar primeiros passos">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="grid gap-1 text-[12.5px] sm:grid-cols-2 xl:grid-cols-3">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={cn("flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted", s.done && "text-muted-foreground line-through")}>
              <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", s.done ? "border-success bg-success text-white" : "border-border")}>{s.done ? <Check className="h-3 w-3" /> : null}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
