import type { Metadata } from "next";
import { StrategyBuilder } from "@/components/strategies/strategy-builder";

export const metadata: Metadata = { title: "Strategies — CryptoScanner", description: "Strategy Builder com regras multi-timeframe reutilizadas no scanner, monitor e backtest." };

export default function StrategiesPage() {
  return <StrategyBuilder />;
}
