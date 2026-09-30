import type { Metadata } from "next";
import { Suspense } from "react";
import { PlansView } from "@/components/account/plans-view";

export const metadata: Metadata = { title: "Planos", description: "Planos PRO e ELITE do CryptoScanner: 3 dias grátis no PRO, garantia de 7 dias na compra.", alternates: { canonical: "/planos" } };
export default function Page() {
  return (
    <Suspense>
      <PlansView />
    </Suspense>
  );
}
