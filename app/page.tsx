import type { Metadata } from "next";
import { Suspense } from "react";
import { TerminalWorkspace } from "@/components/terminal/workspace";

export const metadata: Metadata = {
  title: "Dashboard — CryptoScanner Market Intelligence",
  description: "Workspace de inteligência de mercado cripto: gráfico, estrutura, liquidez, suporte/resistência, Confluence Score, derivativos (Binance, Bybit, OKX), histórico do setup e risco no mesmo contexto.",
};

/** Dashboard = Market Intelligence Workspace. Contexto global na URL: ?symbol=&tf=&exchange=&instrument= */
export default function DashboardPage() {
  return (
    <Suspense>
      <TerminalWorkspace mode="dashboard" />
    </Suspense>
  );
}
