import type { Metadata } from "next";
import { Suspense } from "react";
import { TerminalView } from "@/components/terminal/terminal-view";

export const metadata: Metadata = { title: "Terminal", description: "Estrutura de mercado, liquidez, multi-timeframe e risco por ativo — cálculos determinísticos sobre candles fechados." };

export default function TerminalPage() {
  return (
    <Suspense>
      <TerminalView />
    </Suspense>
  );
}
