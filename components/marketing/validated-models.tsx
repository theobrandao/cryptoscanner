"use client";

import { LineChart, StatTile } from "@/components/ui/showcase";
import type { LandingData } from "@/components/marketing/landing";

export const fmtR = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2).replace(".", ",")}R`;

/** Cartões dos modelos testados fora da amostra (números de lib/strategies/definition.ts e curva de validation-curves.json). */
export function ValidatedModels({ models }: { models: LandingData["validated"] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {models.map((m) => {
        const k = m.validation.metrics;
        return (
          <article key={m.name} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[16px] font-bold sm:text-[17px]">{m.name}</h3>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{m.validation.label}</span>
            </div>
            <p className="text-[13px] text-muted-foreground">{m.description}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Operações" value={k.trades} sub={k.period} className="px-3" />
              <StatTile label="Por operação" value={fmtR(k.expectancyR)} tone="up" sub="líquido de custos" className="px-3" />
              <StatTile label="Fator de lucro" value={k.profitFactor.toFixed(2).replace(".", ",")} sub={`acerto ${k.winPct}%`} className="px-3" />
              <StatTile label="Ativos positivos" value={`${k.assetsPositive}/${k.assetsTotal}`} className="px-3" />
            </div>
            <div>
              <div className="mb-1 text-[11.5px] text-muted-foreground">R acumulado fora da amostra, operação a operação</div>
              <LineChart values={m.curve} height={130} tone="up" label={`R acumulado fora da amostra — ${m.name}`} />
            </div>
            <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[12.5px] leading-relaxed text-warning">{m.validation.caveats}</p>
          </article>
        );
      })}
    </div>
  );
}
