import type { Metadata } from "next";
import { DerivativesView } from "@/components/market/derivatives-view";

export const metadata: Metadata = { title: "Derivatives", description: "Open interest, funding e agressão taker dos perpétuos USDT." };
export default function Page() {
  return <DerivativesView />;
}
