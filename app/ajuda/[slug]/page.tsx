import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tutorialCardData } from "@/components/help/card-data";
import { TutorialPage } from "@/components/help/tutorial-page";
import { getTutorialMedia, pairStepMedia } from "@/lib/content/tutorial-media";
import { getTutorial, TUTORIALS, tutorialPath } from "@/lib/content/tutorials";
import { breadcrumbLd, howToLd, JsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { tutorialSeo } from "@/lib/seo/pages";

type Props = { params: Promise<{ slug: string }> };

/** Os tutoriais são gerados no build; qualquer outro endereço em /ajuda/… dá 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return TUTORIALS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getTutorial((await params).slug);
  if (!t) return {};
  // imagem de compartilhamento: a capa capturada do tutorial; sem capa, a imagem geral do site
  const cover = getTutorialMedia(t.slug)?.cover;
  return publicPageMetadata({ ...tutorialSeo(t), ogType: "article", images: cover ? [{ url: cover.src, width: cover.width, height: cover.height, alt: `Tela do tutorial ${t.title}` }] : undefined });
}

export default async function TutorialRoute({ params }: Props) {
  const t = getTutorial((await params).slug);
  if (!t) notFound();
  const media = getTutorialMedia(t.slug);
  const { byStep } = pairStepMedia(t.steps, media?.steps ?? []);
  return (
    <>
      <JsonLd
        data={[
          howToLd(t, media ? { cover: media.cover, poster: media.poster, video: media.video, capturedAt: media.capturedAt, stepImages: byStep } : null),
          breadcrumbLd([["Início", "/"], ["Tutoriais", "/ajuda"], [t.title, tutorialPath(t.slug)]]),
        ]}
      />
      <TutorialPage tutorial={t} media={media} cardFor={tutorialCardData} />
    </>
  );
}
