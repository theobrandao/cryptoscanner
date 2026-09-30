import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { termsForLesson } from "@/lib/content/glossary";
import { LESSONS, LEVEL_LABEL, lessonPath, type Lesson, type LessonLevel } from "@/lib/content/lessons";
import { GlossaryTerms } from "@/components/help/glossary-terms";
import { cn } from "@/lib/utils";
import { LessonArt } from "./lesson-art";
import { hasLab, stepHeadingId } from "./lesson-lab-meta";
import { LessonDoneBadge, LessonLab, LessonQuiz, LessonStepper } from "./lesson-reader";

const LEVEL_VARIANT: Record<LessonLevel, "outline" | "default" | "accent"> = { iniciante: "outline", intermediario: "default", avancado: "accent" };

/**
 * Página de uma aula da Jornada (componente de servidor): partes, pontos-chave e perguntas vão prontos no HTML;
 * só a navegação por etapas, o exercício e a correção do teste rodam no navegador.
 */
export function LessonPage({ lesson }: { lesson: Lesson }) {
  const idx = LESSONS.findIndex((l) => l.slug === lesson.slug);
  const link = (l: Lesson | undefined) => (l ? { href: lessonPath(l.slug), order: l.order, title: l.title } : undefined);
  const prev = link(LESSONS[idx - 1]);
  const next = link(LESSONS[idx + 1]);
  const lab = hasLab(lesson.slug);

  const steps = [...lesson.sections.map((s, i) => ({ key: `s${i}`, label: s.heading })), { key: "keys", label: "Pontos-chave" }, ...(lab ? [{ key: "lab", label: "Pratique" }] : []), { key: "quiz", label: "Teste rápido" }];
  const panels = [
    ...lesson.sections.map((s, i) => (
      <section key={`s${i}`}>
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          Parte {i + 1} de {lesson.sections.length}
        </div>
        <h2 id={stepHeadingId(`s${i}`)} tabIndex={-1} className="mt-1 text-lg font-semibold outline-none">
          {s.heading}
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
      </section>
    )),
    <section key="keys">
      <h2 id={stepHeadingId("keys")} tabIndex={-1} className="text-lg font-semibold outline-none">
        Pontos-chave
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {lesson.keyPoints.map((k, i) => (
          <li key={k} className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="icon-tile flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold" aria-hidden>
              {i + 1}
            </div>
            <p className="mt-2 text-sm">{k}</p>
          </li>
        ))}
      </ol>
    </section>,
    ...(lab ? [<LessonLab key="lab" slug={lesson.slug} stepKey="lab" />] : []),
    <LessonQuiz key="quiz" slug={lesson.slug} stepKey="quiz" quiz={lesson.quiz} next={next} practice={lesson.practice} />,
  ];

  return (
    <PageShell>
      <article className="flex flex-col gap-4" aria-labelledby="aula-titulo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/jornada" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Todas as aulas
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">Use ← → do teclado para navegar</span>
        </div>

        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col justify-center p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={LEVEL_VARIANT[lesson.level]}>{LEVEL_LABEL[lesson.level]}</Badge>
                <span>
                  Aula {lesson.order} de {LESSONS.length} · {lesson.minutes} min
                </span>
                <LessonDoneBadge slug={lesson.slug} quizLength={lesson.quiz.length} />
              </div>
              <h1 id="aula-titulo" className="mt-2 text-xl font-bold leading-tight sm:text-2xl">
                {lesson.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{lesson.summary}</p>
            </div>
            <LessonArt slug={lesson.slug} className="aspect-[16/9] rounded-none border-0 md:border-l" />
          </div>
        </Card>

        <LessonStepper steps={steps} panels={panels} prev={prev} />

        <GlossaryTerms terms={termsForLesson(lesson.slug)} title="Termos desta aula" id="termos-aula" />

        <nav aria-label="Outras aulas" className="mt-2 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {prev ? (
            <Link href={prev.href} className="group flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary/50 hover:bg-muted/40">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden /> Aula anterior
              </span>
              <span className="mt-0.5 font-semibold">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link href={next.href} className={cn("group flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary/50 hover:bg-muted/40 sm:items-end sm:text-right")}>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Próxima aula <ArrowRight className="h-3 w-3" aria-hidden />
              </span>
              <span className="mt-0.5 font-semibold">{next.title}</span>
            </Link>
          ) : (
            <Link href="/jornada" className="flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary/50 hover:bg-muted/40 sm:items-end sm:text-right">
              <span className="text-xs text-muted-foreground">Fim da trilha</span>
              <span className="mt-0.5 font-semibold">Ver todas as aulas</span>
            </Link>
          )}
        </nav>
        <p className="text-xs text-muted-foreground">Conteúdo educativo, não é recomendação de investimento.</p>
      </article>
    </PageShell>
  );
}
