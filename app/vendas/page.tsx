import type { Metadata } from "next";
import Script from "next/script";

import { SalesPage } from "@/components/marketing/sales-page";
import { buildLandingData } from "@/lib/marketing/landing-data";
import { salesFaq } from "@/lib/marketing/faq";
import { getPublicPrices } from "@/lib/billing/public-prices";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { faqPageLd, JsonLd, softwareApplicationLd } from "@/lib/seo/json-ld";
import { PAGE_SEO } from "@/lib/seo/pages";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.vendas);

/** Página de vendas: destino dos anúncios e URL da página de vendas cadastrada na Kiwify. Preços e canal de venda saem no HTML (FAQ da Kiwify incluída). */
export default function VendasPage() {
  const prices = getPublicPrices();

  return (
    <>
      <JsonLd
        data={[
          softwareApplicationLd("/vendas"),
          faqPageLd(
            salesFaq(prices.trialDays, prices.provider === "kiwify"),
            "/vendas"
          ),
        ]}
      />
      <SalesPage
        content={buildLandingData()}
        initialPrices={prices}
      />
      <Script
        id="google-ads-conversion"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            gtag('event', 'conversion', {'send_to': 'AW-18485599082/zgaICOS2oYwdEOq2z-5E'});
          `,
        }}
      />
    </>
  );
}
