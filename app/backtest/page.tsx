import type { Metadata } from "next";
import { Suspense } from "react";
import { BacktestView } from "@/components/backtest/backtest-view";

export const metadata: Metadata = { title: "Backtest", description: "Backtest do setup e de estratégias com taxas, slippage, funding e curva de capital." };

export default function BacktestPage() {
  return (
    <Suspense>
      <BacktestView />
    </Suspense>
  );
}
