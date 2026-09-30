import type { Metadata } from "next";
import { JourneyView, type LessonCardData } from "@/components/learning/journey-view";
import { hasLab } from "@/components/learning/lesson-lab-meta";
import { LESSONS, LEVEL_LABEL } from "@/lib/content/lessons";
import { courseLd, JsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";

const DESCRIPTION = "Curso grátis de análise técnica de cripto, sem cadastro: 12 aulas curtas do Bitcoin à gestão de risco, com exercícios e teste rápido.";

export const metadata: Metadata = publicPageMetadata({ path: "/jornada", title: "Jornada Trader: curso grátis de análise técnica de cripto", absoluteTitle: true, description: DESCRIPTION });

/** Lista das aulas: só o resumo de cada uma vai para o navegador; o texto completo fica em /jornada/[slug]. */
export default function JourneyPage() {
  const lessons: LessonCardData[] = LESSONS.map((l) => ({ slug: l.slug, order: l.order, level: l.level, title: l.title, minutes: l.minutes, summary: l.summary, parts: l.sections.length, quizLength: l.quiz.length, interactive: hasLab(l.slug) }));
  return (
    <>
      <JsonLd data={courseLd(LESSONS, DESCRIPTION)} />
      <JourneyView lessons={lessons} levelLabels={LEVEL_LABEL} />
    </>
  );
}
