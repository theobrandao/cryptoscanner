import type { Metadata } from "next";
import { Suspense } from "react";
import { DerivativesView } from "@/components/market/derivatives-view";

export const metadata: Metadata = { title: "Derivativos", description: "Open interest, funding, basis e CVD aproximado dos perpétuos USDT em Binance, Bybit e OKX." };
export default function Page() {
  return (
    <Suspense>
      <DerivativesView />
    </Suspense>
  );
}
