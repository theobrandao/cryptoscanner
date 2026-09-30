import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PAGE_SEO } from "@/lib/seo/pages";
import { SalesPage } from "@/components/marketing/sales-page";
import { buildLandingData } from "@/lib/marketing/landing-data";
import { getPublicPrices } from "@/lib/billing/public-prices";
import { faqPageLd, JsonLd, softwareApplicationLd } from "@/lib/seo/json-ld";
import { salesFaq } from "@/lib/marketing/faq";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.vendas);

/** Página de vendas: destino dos anúncios e URL da página de vendas cadastrada na Kiwify. Preços e canal de venda saem no HTML (FAQ da Kiwify incluída). */
export default function VendasPage() {
  const prices = getPublicPrices();
  return (
    <>
      <JsonLd data={[softwareApplicationLd("/vendas"), faqPageLd(salesFaq(prices.trialDays, prices.provider === "kiwify"), "/vendas")]} />
      <SalesPage content={buildLandingData()} initialPrices={prices} />
    </>
  );
}
