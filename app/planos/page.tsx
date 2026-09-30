import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PlansView } from "@/components/account/plans-view";
import { getPublicPrices } from "@/lib/billing/public-prices";

export const metadata: Metadata = publicPageMetadata({ path: "/planos", title: "Planos PRO e ELITE", description: "Planos PRO e ELITE do CryptoScanner: o que cada um inclui, 3 dias grátis no PRO sem cartão e arrependimento em até 7 dias com reembolso integral." });

/** Título, cartões e preços (PRICE_*_BRL) saem no HTML do servidor; só o aviso de volta do checkout lê a URL no cliente. */
export default function Page() {
  return <PlansView initial={getPublicPrices()} />;
}
