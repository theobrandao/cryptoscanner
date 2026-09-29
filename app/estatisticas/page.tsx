import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsView } from "@/components/stats/stats-view";

export const metadata: Metadata = { title: "Taxa de acerto dos padrões", description: "Backtest walk-forward e acompanhamento ao vivo dos padrões gráficos em 4H e 1D." };

export default function StatsPage() {
  return (
    <Suspense>
      <StatsView />
    </Suspense>
  );
}
