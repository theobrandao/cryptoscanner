import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PAGE_SEO } from "@/lib/seo/pages";
import { SalesPage } from "@/components/marketing/sales-page";
import { buildLandingData } from "@/lib/marketing/landing-data";
import { getPublicPrices } from "@/lib/billing/public-prices";
import { faqPageLd, JsonLd, softwareApplicationLd } from "@/lib/seo/json-ld";
import { salesFaq } from "@/lib/marketing/faq";
import Script from 'next/script';
export const metadata: Metadata = publicPageMetadata(PAGE_SEO.vendas);
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* Tag Global do Google Ads */}
        <Script 
          strategy="afterInteractive" 
          src="https://www.googletagmanager.com/gtag/js?id=AW-18485599082" 
        />
        <Script
          id="google-ads-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-18485599082');
            `,
          }}
        />

        {children}
      </body>
    </html>
  );
}
/** Página de vendas: destino dos anúncios e URL da página de vendas cadastrada na Kiwify. Preços e canal de venda saem no HTML (FAQ da Kiwify incluída). */
export default function VendasPage() {
  const prices = getPublicPrices();
  return (
    <>
      <JsonLd data={[softwareApplicationLd("/vendas"), faqPageLd(salesFaq(prices.trialDays, prices.provider === "kiwify"), "/vendas")]} />
      <SalesPage content={buildLandingData()} initialPrices={prices} />
    </>import Script from 'next/script';

export default function VendasPage() {
  // ... seu código existente ...

  return (
    <>
      {/* Resto da sua página Vendas ... */}
      
      {/* Snippet de Evento disparado apenas nesta página */}
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
  );
}
