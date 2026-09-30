"use client";

import * as React from "react";
import { ArrowRight, Check, FlaskConical } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import type { LessonLevel } from "@/lib/content/lessons";
import { cn } from "@/lib/utils";
import { JourneyHeroArt, LessonArt } from "./lesson-art";
import { useLearningProgress } from "./use-learning-progress";

/** Resumo de uma aula para a lista (o texto completo fica só na página da aula). */
export interface LessonCardData {
  slug: string;
  order: number;
  level: LessonLevel;
  title: string;
  minutes: number;
  summary: string;
  parts: number;
  quizLength: number;
  interactive: boolean;
}

type Filter = "todas" | LessonLevel;

/** Endereço da aula (igual a lessonPath em lib/content/lessons.ts; repetido para não levar o texto das aulas ao navegador). */
const lessonPath = (slug: string) => `/jornada/${slug}`;

const LEVEL_VARIANT: Record<LessonLevel, "outline" | "default" | "accent"> = { iniciante: "outline", intermediario: "default", avancado: "accent" };

/**
 * Jornada Trader: lista das 12 aulas (aberta, sem login). Cada aula tem página própria em /jornada/[slug].
 * Progresso fica no navegador; com conta, também é sincronizado pelo /api/learning.
 */
export function JourneyView({ lessons, levelLabels }: { lessons: LessonCardData[]; levelLabels: Record<LessonLevel, string> }) {
  const { progress, loggedIn } = useLearningProgress();
  const [filter, setFilter] = React.useState<Filter>("todas");
  const total = lessons.length;
  const totalMin = lessons.reduce((s, l) => s + l.minutes, 0);
  const done = lessons.filter((l) => progress[l.slug]?.done).length;
  const pct = Math.round((done / total) * 100);
  const nextUp = lessons.find((l) => !progress[l.slug]?.done);
  const shown = filter === "todas" ? lessons : lessons.filter((l) => l.level === filter);

  return (
    <PageShell>
      <Card className="mb-5 overflow-hidden card-glow">
        <CardContent className="grid items-center gap-4 p-5 md:grid-cols-[1fr_320px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Grátis · sem cadastro</Badge>
              <span className="text-xs text-muted-foreground">
                {total} aulas · {totalMin} min no total
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Jornada <span className="text-gradient">Trader</span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Curso grátis de análise técnica de criptomoedas, do Bitcoin à automação com agentes: aulas curtas com ilustrações, exercícios para mexer e teste rápido no fim de cada uma. Conteúdo educativo, não é recomendação de investimento.
            </p>
            <div className="mt-4 max-w-md">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Seu progresso</span>
                <span className="tabular text-muted-foreground">
                  {done}/{total} aulas · {pct}%
                </span>
              </div>
              <Progress value={pct} tone="primary" className="mt-1" label="Seu progresso na Jornada" valueText={`${done} de ${total} aulas`} />
              <p className="mt-1 text-xs text-muted-foreground">
                {loggedIn ? (
                  "Salvo na sua conta."
                ) : (
                  <>
                    Salvo neste navegador.{" "}
                    <Link href="/registro" className="text-primary hover:underline">
                      Crie uma conta
                    </Link>{" "}
                    para guardar em qualquer aparelho.
                  </>
                )}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {nextUp ? (
                <Link href={lessonPath(nextUp.slug)} className={buttonVariants()}>
                  {done ? "Continuar" : "Começar"}: aula {nextUp.order} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <Badge variant="default" className="px-3 py-1.5 text-sm">
                  <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Trilha concluída
                </Badge>
              )}
            </div>
          </div>
          <JourneyHeroArt done={done} className="hidden h-44 w-full md:block" />
        </CardContent>
      </Card>

      <section aria-labelledby="jornada-aulas">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="jornada-aulas" className="text-lg font-semibold">
            Aulas
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por nível">
            {(["todas", "iniciante", "intermediario", "avancado"] as const).map((f) => {
              const list = f === "todas" ? lessons : lessons.filter((l) => l.level === f);
              const d = list.filter((l) => progress[l.slug]?.done).length;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn("inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors", filter === f ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted")}
                >
                  {f === "todas" ? "Todas" : levelLabels[f]}
                  <span className="tabular text-xs text-muted-foreground">
                    {d}/{list.length}
                    <span className="sr-only"> concluídas</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => {
            const p = progress[l.slug];
            const isNext = nextUp?.slug === l.slug;
            return (
              <Link key={l.slug} href={lessonPath(l.slug)} className="group block rounded-lg text-left">
                <Card className={cn("h-full overflow-hidden transition-[transform,border-color] group-hover:-translate-y-px group-hover:border-primary/50 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0", p?.done && "border-primary/30", isNext && !p?.done && "ring-1 ring-primary/40")}>
                  <div className="relative">
                    <LessonArt slug={l.slug} compact className="aspect-[16/9] rounded-none border-0 border-b" />
                    <span className="absolute left-2 top-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-semibold backdrop-blur">Aula {l.order}</span>
                    {p?.done ? (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-xs font-semibold text-primary backdrop-blur">
                        <Check className="h-3 w-3" aria-hidden /> {p.score}/{l.quizLength}
                        <span className="sr-only"> corretas</span>
                      </span>
                    ) : null}
                    {l.interactive ? (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] backdrop-blur">
                        <FlaskConical className="h-3 w-3" aria-hidden /> interativa
                      </span>
                    ) : null}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {l.minutes} min · {l.parts} partes
                      </span>
                      <Badge variant={LEVEL_VARIANT[l.level]}>{levelLabels[l.level]}</Badge>
                    </div>
                    <h3 className="mt-2 font-semibold leading-snug">{l.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{l.summary}</p>
                    <div className="mt-3 text-xs font-medium">{p?.done ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Check className="h-3 w-3" aria-hidden /> Concluída · revisar</span> : <span className="text-primary">{isNext ? "Próxima da trilha →" : "Abrir aula →"}</span>}</div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {!loggedIn ? (
        <Card className="mt-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="font-semibold">Pratique o que aprendeu com dados reais</div>
              <p className="text-sm text-muted-foreground">Scanner de padrões, alertas e simulador em 30 criptomoedas. 3 dias grátis no PRO.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/vendas" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">
                Conhecer o app
              </Link>
              <Link href="/registro" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Criar conta grátis
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
