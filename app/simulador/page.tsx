import type { Metadata } from "next";
import { SimulatorView } from "@/components/market/simulator-view";

export const metadata: Metadata = { title: "Simulador de Aportes", description: "Backtest de DCA e aporte único com preços diários reais, em BRL ou USD." };

export default function SimulatorPage() {
  return <SimulatorView />;
}
