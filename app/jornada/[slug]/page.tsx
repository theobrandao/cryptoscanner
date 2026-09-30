import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPage } from "@/components/learning/lesson-page";
import { getLesson, LESSONS, lessonPath } from "@/lib/content/lessons";
import { JsonLd, lessonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };

/** As 12 aulas são geradas no build; qualquer outro endereço em /jornada/… dá 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = getLesson((await params).slug);
  if (!lesson) return {};
  return publicPageMetadata({ path: lessonPath(lesson.slug), title: `${lesson.title} · Jornada Trader`, absoluteTitle: true, description: `Aula ${lesson.order} grátis da Jornada Trader: ${lesson.summary}`, ogType: "article" });
}

export default async function LessonRoute({ params }: Props) {
  const lesson = getLesson((await params).slug);
  if (!lesson) notFound();
  return (
    <>
      <JsonLd data={lessonLd(lesson)} />
      <LessonPage lesson={lesson} />
    </>
  );
}
