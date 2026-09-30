import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { SalesPage } from "@/components/marketing/sales-page";
import { buildLandingData } from "@/lib/marketing/landing-data";
import { getPublicPrices } from "@/lib/billing/public-prices";
import { JsonLd, softwareApplicationLd } from "@/lib/seo/json-ld";

export const metadata: Metadata = publicPageMetadata({ path: "/vendas", title: "CryptoScanner — padrões, sinais testados e alertas de cripto", absoluteTitle: true, description: "Scanner de 17 padrões gráficos, modelo de rompimento testado fora da amostra e agentes com alertas para 30 criptos. 3 dias grátis no PRO, sem cartão." });

/** Página de vendas: destino dos anúncios e URL da página de vendas cadastrada na Kiwify. Preços e canal de venda saem no HTML (FAQ da Kiwify incluída). */
export default function VendasPage() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("/vendas")} />
      <SalesPage content={buildLandingData()} initialPrices={getPublicPrices()} />
    </>
  );
}
