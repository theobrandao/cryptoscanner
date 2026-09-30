import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { tutorialCardData } from "@/components/help/card-data";
import { TutorialIndex } from "@/components/help/tutorial-index";
import { STARTER_SLUGS, TUTORIALS } from "@/lib/content/tutorials";
import { breadcrumbLd, JsonLd, tutorialsIndexLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PAGE_SEO } from "@/lib/seo/pages";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.ajuda);

/** Central de tutoriais (pública e estática): só os resumos vão para o navegador; o texto completo fica em /ajuda/[slug]. */
export default function HelpIndexPage() {
  const cards = TUTORIALS.map(tutorialCardData);
  const starters = STARTER_SLUGS.map((s) => cards.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  return (
    <>
      <JsonLd data={[tutorialsIndexLd(TUTORIALS), breadcrumbLd([["Início", "/"], ["Tutoriais", "/ajuda"]])]} />
      <PageShell>
        <TutorialIndex tutorials={cards} starters={starters} />
      </PageShell>
    </>
  );
}
