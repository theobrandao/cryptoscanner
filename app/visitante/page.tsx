import type { Metadata } from "next";
import { VisitorHome } from "@/components/layout/visitor-home";
import { buildLandingData } from "@/lib/marketing/landing-data";
import { JsonLd, organizationLd, websiteLd } from "@/lib/seo/json-ld";
import { HOME_METADATA } from "@/lib/seo/metadata";

/** Mesmos metadados da Início: o endereço público desta página é "/" (canonical), via proxy.ts. */
export const metadata: Metadata = HOME_METADATA;

/**
 * Início do visitante, estática (sem cookies nem searchParams): o proxy reescreve "/" para cá quando não há
 * cookie de sessão, então a resposta pode ficar em cache na CDN. Quem tem sessão recebe app/page.tsx.
 */
export default function VisitorHomePage() {
  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd()]} />
      <VisitorHome landing={buildLandingData()} />
    </>
  );
}
