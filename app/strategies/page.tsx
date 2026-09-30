import type { Metadata } from "next";
import { StrategyBuilder } from "@/components/strategies/strategy-builder";

export const metadata: Metadata = { title: "Construtor de estratégias", description: "Regras multi-timeframe reutilizadas no scanner, monitor e backtest." };

export default function StrategiesPage() {
  return <StrategyBuilder />;
}
