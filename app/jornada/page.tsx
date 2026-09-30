import type { Metadata } from "next";
import { JourneyView, type LessonCardData } from "@/components/learning/journey-view";
import { hasLab } from "@/components/learning/lesson-lab-meta";
import { LESSONS, LEVEL_LABEL } from "@/lib/content/lessons";
import { breadcrumbLd, courseLd, JsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PAGE_SEO } from "@/lib/seo/pages";

const DESCRIPTION = PAGE_SEO.jornada.description;

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.jornada);

/** Lista das aulas: só o resumo de cada uma vai para o navegador; o texto completo fica em /jornada/[slug]. */
export default function JourneyPage() {
  const lessons: LessonCardData[] = LESSONS.map((l) => ({ slug: l.slug, order: l.order, level: l.level, title: l.title, minutes: l.minutes, summary: l.summary, parts: l.sections.length, quizLength: l.quiz.length, interactive: hasLab(l.slug) }));
  return (
    <>
      <JsonLd data={[courseLd(LESSONS, DESCRIPTION), breadcrumbLd([["Início", "/"], ["Jornada Trader", "/jornada"]])]} />
      <JourneyView lessons={lessons} levelLabels={LEVEL_LABEL} />
    </>
  );
}
