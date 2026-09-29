import type { Metadata } from "next";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { RiskCalculator } from "@/components/risk/risk-calculator";

export const metadata: Metadata = { title: "Risco", description: "Tamanho de posição pelo risco, liquidação, preço médio e stress test." };

export default function RiskPage() {
  return (
    <PageShell>
      <PageTitle icon="🛡️" title="Gestão de risco" description="Tamanho de posição, alavancagem e liquidação, preço médio e stress test. Cálculo local; nenhum dado sai do navegador." />
      <RiskCalculator />
    </PageShell>
  );
}
