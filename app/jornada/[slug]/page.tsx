import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPage } from "@/components/learning/lesson-page";
import { getLesson, LESSONS, lessonPath } from "@/lib/content/lessons";
import { breadcrumbLd, JsonLd, lessonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { lessonSeo } from "@/lib/seo/pages";

type Props = { params: Promise<{ slug: string }> };

/** As 12 aulas são geradas no build; qualquer outro endereço em /jornada/… dá 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = getLesson((await params).slug);
  if (!lesson) return {};
  // imagem de compartilhamento: app/jornada/[slug]/opengraph-image.tsx (título da aula sobre a marca)
  return publicPageMetadata({ ...lessonSeo(lesson), ogType: "article", images: null });
}

export default async function LessonRoute({ params }: Props) {
  const lesson = getLesson((await params).slug);
  if (!lesson) notFound();
  return (
    <>
      <JsonLd data={[lessonLd(lesson), breadcrumbLd([["Início", "/"], ["Jornada Trader", "/jornada"], [lesson.title, lessonPath(lesson.slug)]])]} />
      <LessonPage lesson={lesson} />
    </>
  );
}
