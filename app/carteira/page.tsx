import type { Metadata } from "next";
import { Suspense } from "react";
import { PortfolioView } from "@/components/market/portfolio-view";
import { PageShell } from "@/components/layout/page-shell";

export const metadata: Metadata = { title: "Carteira", description: "Watchlist, posições simuladas, alertas e análises salvas." };

export default function PortfolioPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div />
        </PageShell>
      }
    >
      <PortfolioView />
    </Suspense>
  );
}
