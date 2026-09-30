import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PAGE_SEO } from "@/lib/seo/pages";
import { PlansView } from "@/components/account/plans-view";
import { getPublicPrices } from "@/lib/billing/public-prices";
import { FaqList } from "@/components/marketing/faq-list";
import { salesFaq } from "@/lib/marketing/faq";
import { breadcrumbLd, faqPageLd, JsonLd, softwareApplicationLd } from "@/lib/seo/json-ld";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.planos);

/**
 * Título, cartões e preços (PRICE_*_BRL) saem no HTML do servidor; só o aviso de volta do checkout lê a URL no cliente.
 * As perguntas frequentes são as mesmas da página de vendas (lib/marketing/faq.ts), no HTML e no JSON-LD FAQPage.
 */
export default function Page() {
  const prices = getPublicPrices();
  const faq = salesFaq(prices.trialDays, prices.provider === "kiwify");
  return (
    <>
      <JsonLd data={[softwareApplicationLd("/planos"), faqPageLd(faq, "/planos"), breadcrumbLd([["Início", "/"], ["Planos", "/planos"]])]} />
      <PlansView
        initial={prices}
        faq={
          <section id="faq" aria-labelledby="planos-faq" className="mt-8 max-w-3xl scroll-mt-20">
            <h2 id="planos-faq" className="text-lg font-semibold">
              Perguntas frequentes
            </h2>
            <FaqList items={faq} compact />
          </section>
        }
      />
    </>
  );
}
