import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketScanner } from "@/components/scanner/market-scanner";

export const metadata: Metadata = {
  title: "Scanner de setups",
  description: "Scanner de 30 criptoativos por estado do setup, Confluence Score, regime, R:R e estratégias salvas.",
};

export default function ScannerPage() {
  return (
    <Suspense>
      <MarketScanner />
    </Suspense>
  );
}
