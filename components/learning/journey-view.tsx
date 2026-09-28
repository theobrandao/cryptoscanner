"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSession } from "@/hooks/use-session";
import { apiFetch } from "@/lib/client-api";
import { LESSONS, LEVEL_LABEL, type Lesson } from "@/lib/content/lessons";
import { cn } from "@/lib/utils";

type ProgressMap = Record<string, { done: boolean; score: number; at: string }>;

/**
 * Jornada Trader: trilha de 12 aulas autorais com teste rápido. Progresso no navegador e, se logado,
 * também na conta (sincronizado pelo /api/learning).
 */
export function JourneyView() {
  const { user } = useSession();
  const [local, setLocal] = useLocalStorage<ProgressMap>("cs-learning", {});
  const { data: remote, mutate } = useSWR<{ progress: ProgressMap }>(user ? "/api/learning" : null);
  const progress: ProgressMap = { ...local, ...(remote?.progress ?? {}) };
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const done = LESSONS.filter((l) => progress[l.slug]?.done).length;
  const pct = Math.round((done / LESSONS.length) * 100);

  const complete = async (lesson: Lesson, score: number) => {
    const entry = { done: true, score, at: new Date().toISOString() };
    setLocal((p) => ({ ...p, [lesson.slug]: entry }));
    if (user) {
      await apiFetch("/api/learning", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress: { [lesson.slug]: entry } }) }).catch(() => undefined);
      await mutate();
    }
  };

  const open = openSlug ? LESSONS.find((l) => l.slug === openSlug) : null;

  return (
    <PageShell>
      <PageTitle icon="🧭" title="Jornada Trader" description={`${LESSONS.length} aulas autorais, do Bitcoin à automação com agentes, com teste rápido e prática direta no app. ${user ? "Progresso salvo na sua conta." : "Progresso salvo neste navegador (faça login para sincronizar)."}`} />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-[200px] flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Progresso</span>
              <span className="tabular text-muted-foreground">
                {done}/{LESSONS.length} aulas · {pct}%
              </span>
            </div>
            <Progress value={pct} tone={pct === 100 ? "success" : "primary"} className="mt-1" />
          </div>
          <div className="flex gap-2 text-xs">
            {(["iniciante", "intermediario", "avancado"] as const).map((lv) => (
              <Badge key={lv} variant="muted">
                {LEVEL_LABEL[lv]}: {LESSONS.filter((l) => l.level === lv && progress[l.slug]?.done).length}/{LESSONS.filter((l) => l.level === lv).length}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      {open ? (
        <LessonPanel lesson={open} saved={progress[open.slug]} onBack={() => setOpenSlug(null)} onComplete={(score) => void complete(open, score)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.map((l) => {
            const p = progress[l.slug];
            return (
              <button key={l.slug} onClick={() => setOpenSlug(l.slug)} className="text-left cursor-pointer">
                <Card className={cn("h-full transition-colors hover:border-primary/50", p?.done && "border-success/50")}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Aula {l.order} · {l.minutes} min</span>
                      <Badge variant={l.level === "iniciante" ? "success" : l.level === "intermediario" ? "default" : "accent"}>{LEVEL_LABEL[l.level]}</Badge>
                    </div>
                    <div className="mt-2 font-semibold">{l.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{l.summary}</p>
                    <div className="mt-3 text-xs">{p?.done ? <span className="text-success">✓ concluída · teste {p.score}/{l.quiz.length}</span> : <span className="text-primary">Abrir aula →</span>}</div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function LessonPanel({ lesson, saved, onBack, onComplete }: { lesson: Lesson; saved?: { done: boolean; score: number }; onBack: () => void; onComplete: (score: number) => void }) {
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [checked, setChecked] = React.useState(false);
  const score = lesson.quiz.filter((q, i) => answers[i] === q.answer).length;
  const idx = LESSONS.findIndex((l) => l.slug === lesson.slug);
  const next = LESSONS[idx + 1];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardDescription>
              Aula {lesson.order} · {LEVEL_LABEL[lesson.level]} · {lesson.minutes} min {saved?.done ? "· ✓ concluída" : ""}
            </CardDescription>
            <CardTitle className="mt-1 text-xl">{lesson.title}</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Todas as aulas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {lesson.sections.map((s) => (
          <section key={s.heading}>
            <h3 className="font-semibold">{s.heading}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </section>
        ))}
        <section className="rounded-md border border-border bg-muted/40 p-3">
          <h3 className="text-sm font-semibold">Pontos-chave</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            {lesson.keyPoints.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">Teste rápido</h3>
          <div className="mt-2 flex flex-col gap-3">
            {lesson.quiz.map((q, i) => (
              <div key={q.q} className="rounded-md border border-border p-3">
                <div className="text-sm font-medium">{q.q}</div>
                <div className="mt-2 flex flex-col gap-1">
                  {q.options.map((o, j) => {
                    const sel = answers[i] === j;
                    const state = checked ? (j === q.answer ? "ok" : sel ? "bad" : "") : sel ? "sel" : "";
                    return (
                      <button
                        key={o}
                        disabled={checked}
                        onClick={() => setAnswers({ ...answers, [i]: j })}
                        className={cn("rounded-md border px-2 py-1.5 text-left text-sm cursor-pointer", state === "sel" && "border-primary bg-primary/10", state === "ok" && "border-success bg-success/10", state === "bad" && "border-danger bg-danger/10", state === "" && "border-border hover:bg-muted")}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
                {checked ? <p className="mt-2 text-xs text-muted-foreground">{q.why}</p> : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!checked ? (
              <Button
                disabled={Object.keys(answers).length < lesson.quiz.length}
                onClick={() => {
                  setChecked(true);
                  onComplete(score);
                }}
              >
                Corrigir e concluir aula
              </Button>
            ) : (
              <>
                <Badge variant={score === lesson.quiz.length ? "success" : "warning"}>
                  {score}/{lesson.quiz.length} corretas
                </Badge>
                {next ? (
                  <Button variant="outline" size="sm" onClick={onBack}>
                    Próxima: {next.title}
                  </Button>
                ) : null}
              </>
            )}
            {lesson.practice ? (
              <Link href={lesson.practice.href} className="text-sm text-primary hover:underline">
                🛠️ {lesson.practice.label}
              </Link>
            ) : null}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
