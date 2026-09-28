import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartView } from "@/components/charts/chart-view";
import { PageShell } from "@/components/layout/page-shell";

export const metadata: Metadata = { title: "Análise de Gráficos", description: "Candles em tempo real com EMA, Bollinger, StochRSI, MACD, suportes/resistências e padrões." };

export default function ChartsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="text-sm text-muted-foreground">Carregando dados…</div>
        </PageShell>
      }
    >
      <ChartView />
    </Suspense>
  );
}
