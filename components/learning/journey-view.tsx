"use client";

import * as React from "react";
import {
  Check,
  CircleCheck,
  FlaskConical,
  Trophy,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSession } from "@/hooks/use-session";
import { apiFetch } from "@/lib/client-api";
import {
  LESSONS,
  LEVEL_LABEL,
  type Lesson,
  type LessonLevel,
} from "@/lib/content/lessons";
import { cn } from "@/lib/utils";
import { JourneyHeroArt, LessonArt } from "./lesson-art";
import { WIDGETS } from "./lesson-widgets";

type Entry = { done: boolean; score: number; at: string };
type ProgressMap = Record<string, Entry>;
type Filter = "todas" | LessonLevel;
type SaveStatus = "saving" | "ok" | "error";

const LEVEL_VARIANT: Record<LessonLevel, "success" | "default" | "accent"> = {
  iniciante: "success",
  intermediario: "default",
  avancado: "accent",
};
const TOTAL_MIN = LESSONS.reduce((s, l) => s + l.minutes, 0);

const PAGE_TITLE_ID = "jornada-titulo";
const LESSON_TITLE_ID = "aula-titulo";
const STEP_HEADING_ID = "aula-etapa-titulo";

/** "smooth" só quando a pessoa não pediu menos movimento no sistema. */
function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  } catch {
    return "auto";
  }
}

function focusById(id: string) {
  document.getElementById(id)?.focus({ preventScroll: true });
}

const lessonHref = (slug: string) => `/jornada?aula=${slug}`;

/**
 * Jornada Trader: trilha aberta (sem login) de 12 aulas autorais com ilustrações, exercícios interativos e
 * teste rápido. Progresso fica no navegador; com conta, também é sincronizado pelo /api/learning.
 * A aula aberta vem da URL (?aula=slug) pelo roteador do Next: link direto, botão Voltar e menu lateral funcionam.
 */
export function JourneyView() {
  // useSearchParams fica dentro do Suspense: a lista de aulas continua no HTML pré-renderizado
  return (
    <React.Suspense fallback={<JourneyContent openSlug={null} />}>
      <JourneyFromUrl />
    </React.Suspense>
  );
}

function JourneyFromUrl() {
  const slug = useSearchParams().get("aula");
  const valid = slug && LESSONS.some((l) => l.slug === slug) ? slug : null;
  return <JourneyContent openSlug={valid} />;
}

function JourneyContent({ openSlug }: { openSlug: string | null }) {
  const router = useRouter();
  const { user } = useSession();
  const [local, setLocal] = useLocalStorage<ProgressMap>("cs-learning", {});
  const { data: remote, mutate } = useSWR<{ progress: ProgressMap }>(
    user ? "/api/learning" : null,
  );
  const progress: ProgressMap = { ...local, ...(remote?.progress ?? {}) };
  const [filter, setFilter] = React.useState<Filter>("todas");
  const [save, setSave] = React.useState<{
    slug: string;
    status: SaveStatus;
    entry: Entry;
  } | null>(null);
  const done = LESSONS.filter((l) => progress[l.slug]?.done).length;
  const pct = Math.round((done / LESSONS.length) * 100);
  const nextUp = LESSONS.find((l) => !progress[l.slug]?.done);

  const openLesson = React.useCallback(
    (slug: string | null) => {
      router.push(slug ? lessonHref(slug) : "/jornada", { scroll: false });
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    },
    [router],
  );

  // foco acompanha a troca de tela: título da aula ao abrir, título da página ao voltar (não na primeira carga)
  const lastSlug = React.useRef(openSlug);
  React.useEffect(() => {
    if (lastSlug.current === openSlug) return;
    lastSlug.current = openSlug;
    focusById(openSlug ? LESSON_TITLE_ID : PAGE_TITLE_ID);
  }, [openSlug]);

  const pushRemote = async (slug: string, entry: Entry) => {
    setSave({ slug, status: "saving", entry });
    try {
      await apiFetch("/api/learning", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: { [slug]: entry } }),
      });
      setSave({ slug, status: "ok", entry });
      await mutate();
    } catch {
      setSave({ slug, status: "error", entry });
    }
  };

  const complete = async (lesson: Lesson, score: number) => {
    const entry = { done: true, score, at: new Date().toISOString() };
    setLocal((p) => ({ ...p, [lesson.slug]: entry }));
    if (user) await pushRemote(lesson.slug, entry);
  };

  const open = openSlug ? LESSONS.find((l) => l.slug === openSlug) : null;
  const shown =
    filter === "todas" ? LESSONS : LESSONS.filter((l) => l.level === filter);

  return (
    <PageShell>
      {open ? (
        <LessonReader
          key={open.slug}
          lesson={open}
          saved={progress[open.slug]}
          loggedIn={!!user}
          saveStatus={save?.slug === open.slug ? save.status : undefined}
          onRetrySave={() => {
            if (save?.slug === open.slug) void pushRemote(save.slug, save.entry);
          }}
          onBack={() => openLesson(null)}
          onOpen={openLesson}
          onComplete={(score) => void complete(open, score)}
        />
      ) : (
        <>
          <Card className="mb-5 overflow-hidden card-glow">
            <CardContent className="grid items-center gap-4 p-5 md:grid-cols-[1fr_320px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">Grátis · sem cadastro</Badge>
                  <span className="text-xs text-muted-foreground">
                    {LESSONS.length} aulas · {TOTAL_MIN} min no total
                  </span>
                </div>
                <h1
                  id={PAGE_TITLE_ID}
                  tabIndex={-1}
                  className="mt-2 text-2xl font-bold tracking-tight outline-none sm:text-3xl"
                >
                  Jornada <span className="text-gradient">Trader</span>
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Do Bitcoin à automação com agentes: aulas curtas com
                  ilustrações, exercícios para mexer e teste rápido no fim de
                  cada uma. Conteúdo educativo, não é recomendação de
                  investimento.
                </p>
                <div className="mt-4 max-w-md">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Seu progresso</span>
                    <span className="tabular text-muted-foreground">
                      {done}/{LESSONS.length} aulas · {pct}%
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    tone={pct === 100 ? "success" : "primary"}
                    className="mt-1"
                    label="Seu progresso na Jornada"
                    valueText={`${done} de ${LESSONS.length} aulas`}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {user ? (
                      "Salvo na sua conta."
                    ) : (
                      <>
                        Salvo neste navegador.{" "}
                        <Link
                          href="/registro"
                          className="text-primary hover:underline"
                        >
                          Crie uma conta
                        </Link>{" "}
                        para guardar em qualquer aparelho.
                      </>
                    )}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {nextUp ? (
                    <Button onClick={() => openLesson(nextUp.slug)}>
                      {done ? "Continuar" : "Começar"}: aula {nextUp.order} →
                    </Button>
                  ) : (
                    <Badge variant="success" className="px-3 py-1.5 text-sm">
                      <Check
                        className="mr-1 inline h-3.5 w-3.5 align-[-2px]"
                        aria-hidden
                      />{" "}
                      Trilha concluída
                    </Badge>
                  )}
                </div>
              </div>
              <JourneyHeroArt
                done={done}
                className="hidden h-44 w-full md:block"
              />
            </CardContent>
          </Card>

          <div
            className="mb-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar por nível"
          >
            {(["todas", "iniciante", "intermediario", "avancado"] as const).map(
              (f) => {
                const list =
                  f === "todas"
                    ? LESSONS
                    : LESSONS.filter((l) => l.level === f);
                const d = list.filter((l) => progress[l.slug]?.done).length;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors cursor-pointer",
                      filter === f
                        ? "border-primary bg-primary/10 font-semibold"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {f === "todas" ? "Todas" : LEVEL_LABEL[f]}
                    <span className="tabular text-xs text-muted-foreground">
                      {d}/{list.length}
                      <span className="sr-only"> concluídas</span>
                    </span>
                  </button>
                );
              },
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => {
              const p = progress[l.slug];
              const isNext = nextUp?.slug === l.slug;
              return (
                <Link
                  key={l.slug}
                  href={lessonHref(l.slug)}
                  className="group block rounded-lg text-left"
                >
                  <Card
                    className={cn(
                      "h-full overflow-hidden transition-[transform,border-color,box-shadow] group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-lg motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
                      p?.done && "border-success/50",
                      isNext && !p?.done && "ring-1 ring-primary/40",
                    )}
                  >
                    <div className="relative">
                      <LessonArt
                        slug={l.slug}
                        compact
                        className="aspect-[16/9] rounded-none border-0 border-b"
                      />
                      <span className="absolute left-2 top-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-semibold backdrop-blur">
                        Aula {l.order}
                      </span>
                      {p?.done ? (
                        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-xs font-semibold text-success backdrop-blur">
                          <Check className="h-3 w-3" aria-hidden /> {p.score}/
                          {l.quiz.length}
                          <span className="sr-only"> corretas</span>
                        </span>
                      ) : null}
                      {WIDGETS[l.slug] ? (
                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] backdrop-blur">
                          <FlaskConical className="h-3 w-3" aria-hidden />{" "}
                          interativa
                        </span>
                      ) : null}
                    </div>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {l.minutes} min · {l.sections.length} partes
                        </span>
                        <Badge variant={LEVEL_VARIANT[l.level]}>
                          {LEVEL_LABEL[l.level]}
                        </Badge>
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug">
                        {l.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {l.summary}
                      </p>
                      <div className="mt-3 text-xs font-medium">
                        {p?.done ? (
                          <span className="text-success">
                            Concluída · revisar
                          </span>
                        ) : (
                          <span className="text-primary">
                            {isNext ? "Próxima da trilha →" : "Abrir aula →"}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {!user ? (
            <Card className="mt-6 card-glow">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="font-semibold">
                    Pratique o que aprendeu com dados reais
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Scanner de padrões, alertas e simulador em 30 criptomoedas.
                    3 dias grátis no PRO.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/vendas"
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
                  >
                    Conhecer o app
                  </Link>
                  <Link
                    href="/registro"
                    className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Criar conta grátis
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

type Step = { key: string; label: string };

/** Alvos em que ← → têm função própria (campos, listas, grupos de opções, controles deslizantes). */
const ARROW_OWNERS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="radiogroup"], [role="radio"], [role="slider"], [role="tablist"], [role="menu"], [role="combobox"]';

function LessonReader({
  lesson,
  saved,
  loggedIn,
  saveStatus,
  onRetrySave,
  onBack,
  onOpen,
  onComplete,
}: {
  lesson: Lesson;
  saved?: { done: boolean; score: number };
  loggedIn: boolean;
  saveStatus?: SaveStatus;
  onRetrySave: () => void;
  onBack: () => void;
  onOpen: (slug: string) => void;
  onComplete: (score: number) => void;
}) {
  const widget = WIDGETS[lesson.slug];
  const steps: Step[] = [
    ...lesson.sections.map((s, i) => ({ key: `s${i}`, label: s.heading })),
    { key: "keys", label: "Pontos-chave" },
    ...(widget ? [{ key: "lab", label: "Pratique" }] : []),
    { key: "quiz", label: "Teste rápido" },
  ];
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [checked, setChecked] = React.useState(false);
  const score = lesson.quiz.filter((q, i) => answers[i] === q.answer).length;
  const idx = LESSONS.findIndex((l) => l.slug === lesson.slug);
  const next = LESSONS[idx + 1];
  const prev = LESSONS[idx - 1];
  const cur = steps[step]!;
  const last = step === steps.length - 1;
  const nSteps = steps.length;
  const go = React.useCallback(
    (n: number) => setStep(Math.max(0, Math.min(nSteps - 1, n))),
    [nSteps],
  );

  const navRef = React.useRef<HTMLElement>(null);
  const firstRender = React.useRef(true);
  // ao trocar de etapa: etapa ativa visível na barra, volta até a barra se ela saiu da tela e o foco vai para o título da etapa
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const nav = navRef.current;
    if (!nav) return;
    const behavior = scrollBehavior();
    nav.querySelector('[aria-current="step"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior,
    });
    if (nav.getBoundingClientRect().top < 64)
      window.scrollTo({
        top: window.scrollY + nav.getBoundingClientRect().top - 80,
        behavior,
      });
    focusById(STEP_HEADING_ID);
  }, [step]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.closest?.(ARROW_OWNERS))) return;
      if (e.key === "ArrowRight") go(step + 1);
      else go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step]);

  // setas dentro de um grupo de respostas movem o foco entre as opções (a escolha continua sendo no clique/Enter)
  const onOptionsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!dir) return;
    const radios = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
    );
    const i = radios.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    radios[(i + dir + radios.length) % radios.length]?.focus();
  };

  const saveMsg = !loggedIn
    ? "Progresso salvo neste navegador."
    : saveStatus === "error"
      ? "Não conseguimos salvar na sua conta; o progresso ficou neste navegador."
      : saveStatus === "saving"
        ? "Salvando na sua conta…"
        : "Progresso salvo na sua conta.";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Todas as aulas
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Use ← → do teclado para navegar
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-center p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={LEVEL_VARIANT[lesson.level]}>
                {LEVEL_LABEL[lesson.level]}
              </Badge>
              <span>
                Aula {lesson.order} de {LESSONS.length} · {lesson.minutes} min
              </span>
              {saved?.done ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden /> concluída (
                  {saved.score}/{lesson.quiz.length})
                </span>
              ) : null}
            </div>
            <h1
              id={LESSON_TITLE_ID}
              tabIndex={-1}
              className="mt-2 text-xl font-bold leading-tight outline-none sm:text-2xl"
            >
              {lesson.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {lesson.summary}
            </p>
          </div>
          <LessonArt
            slug={lesson.slug}
            className="aspect-[16/9] rounded-none border-0 md:border-l"
          />
        </div>
        <div className="h-1 w-full bg-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </Card>

      <nav
        ref={navRef}
        aria-label="Etapas da aula"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(i)}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-colors cursor-pointer",
              i === step
                ? "border-primary bg-primary text-primary-foreground"
                : i < step
                  ? "border-primary/40 bg-primary/10"
                  : "border-border hover:bg-muted",
            )}
          >
            <span className="tabular text-xs opacity-80">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <Card>
        <CardContent className="p-5 sm:p-6" key={cur.key}>
          <div className="fade-up">
            {cur.key.startsWith("s") ? (
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Parte {step + 1} de {lesson.sections.length}
                </div>
                <h2
                  id={STEP_HEADING_ID}
                  tabIndex={-1}
                  className="mt-1 text-lg font-semibold outline-none"
                >
                  {lesson.sections[step]!.heading}
                </h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
                  {lesson.sections[step]!.body}
                </p>
              </section>
            ) : null}

            {cur.key === "keys" ? (
              <section>
                <h2
                  id={STEP_HEADING_ID}
                  tabIndex={-1}
                  className="text-lg font-semibold outline-none"
                >
                  Pontos-chave
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {lesson.keyPoints.map((k, i) => (
                    <div
                      key={k}
                      className="rounded-lg border border-border bg-muted/40 p-4"
                    >
                      <div className="icon-tile flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold">
                        {i + 1}
                      </div>
                      <p className="mt-2 text-sm">{k}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {cur.key === "lab" && widget ? (
              <section>
                <h2
                  id={STEP_HEADING_ID}
                  tabIndex={-1}
                  className="flex items-center gap-2 text-lg font-semibold outline-none"
                >
                  <FlaskConical className="h-4 w-4 text-primary" aria-hidden />{" "}
                  {widget.title}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {widget.hint}
                </p>
                <widget.Component />
              </section>
            ) : null}

            {cur.key === "quiz" ? (
              <section>
                <h2
                  id={STEP_HEADING_ID}
                  tabIndex={-1}
                  className="text-lg font-semibold outline-none"
                >
                  Teste rápido
                </h2>
                <p className="text-sm text-muted-foreground">
                  {lesson.quiz.length} perguntas. A resposta aparece assim que
                  você escolhe.
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  {lesson.quiz.map((q, i) => {
                    const answered = answers[i] !== undefined;
                    const locked = answered || checked;
                    const qid = `${lesson.slug}-q${i}`;
                    return (
                      <div
                        key={q.q}
                        className="rounded-lg border border-border p-4"
                      >
                        <div id={qid} className="text-sm font-medium">
                          {i + 1}. {q.q}
                        </div>
                        <div
                          role="radiogroup"
                          aria-labelledby={qid}
                          onKeyDown={onOptionsKey}
                          className="mt-2 flex flex-col gap-1.5"
                        >
                          {q.options.map((o, j) => {
                            const sel = answers[i] === j;
                            const state = answered
                              ? j === q.answer
                                ? "ok"
                                : sel
                                  ? "bad"
                                  : "off"
                              : "";
                            return (
                              <button
                                key={o}
                                type="button"
                                role="radio"
                                aria-checked={sel}
                                aria-disabled={locked || undefined}
                                onClick={() => {
                                  if (locked) return;
                                  setAnswers({ ...answers, [i]: j });
                                }}
                                className={cn(
                                  "flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors cursor-pointer aria-disabled:cursor-default",
                                  state === "ok" &&
                                    "border-success bg-success/10",
                                  state === "bad" &&
                                    "border-danger bg-danger/10",
                                  state === "off" && "border-border opacity-60",
                                  state === "" &&
                                    "border-border hover:border-primary/50 hover:bg-muted",
                                )}
                              >
                                <span className="flex w-4 shrink-0 justify-center text-center">
                                  {state === "ok" ? (
                                    <>
                                      <Check
                                        className="h-4 w-4 text-success"
                                        aria-hidden
                                      />
                                      <span className="sr-only">
                                        (correta)
                                      </span>
                                    </>
                                  ) : state === "bad" ? (
                                    <>
                                      <X
                                        className="h-4 w-4 text-danger"
                                        aria-hidden
                                      />
                                      <span className="sr-only">
                                        (incorreta)
                                      </span>
                                    </>
                                  ) : (
                                    <span aria-hidden>
                                      {String.fromCharCode(65 + j)}
                                    </span>
                                  )}
                                </span>
                                {o}
                              </button>
                            );
                          })}
                        </div>
                        <div role="status">
                          {answered ? (
                            <p
                              className={cn(
                                "mt-2 text-xs",
                                answers[i] === q.answer
                                  ? "text-success"
                                  : "text-danger",
                              )}
                            >
                              {answers[i] === q.answer
                                ? "Correto. "
                                : "Não é essa. "}
                              <span className="text-muted-foreground">
                                {q.why}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!checked ? (
                  <Button
                    className="mt-4"
                    disabled={Object.keys(answers).length < lesson.quiz.length}
                    onClick={() => {
                      setChecked(true);
                      onComplete(score);
                    }}
                  >
                    Corrigir e concluir aula
                  </Button>
                ) : (
                  <div className="mt-4 rounded-lg border border-success/40 bg-success/10 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {score === lesson.quiz.length ? (
                        <Trophy className="h-6 w-6 text-success" aria-hidden />
                      ) : (
                        <CircleCheck
                          className="h-6 w-6 text-success"
                          aria-hidden
                        />
                      )}
                      <span className="font-semibold">Aula concluída</span>
                      <Badge
                        variant={
                          score === lesson.quiz.length ? "success" : "warning"
                        }
                      >
                        {score}/{lesson.quiz.length} corretas
                      </Badge>
                    </div>
                    <div aria-live="polite">
                      <p className="mt-1 text-sm text-muted-foreground">
                        {saveMsg}
                        {score < lesson.quiz.length
                          ? " Vale reler a parte da pergunta que você errou."
                          : ""}
                      </p>
                      {loggedIn && saveStatus === "error" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={onRetrySave}
                        >
                          Tentar de novo
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {next ? (
                        <Button onClick={() => onOpen(next.slug)}>
                          Próxima aula: {next.title} →
                        </Button>
                      ) : (
                        <Button onClick={onBack}>Ver a trilha completa</Button>
                      )}
                      {lesson.practice ? (
                        <Link
                          href={lesson.practice.href}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
                        >
                          <Wrench className="h-4 w-4" aria-hidden />{" "}
                          {lesson.practice.label}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        {step > 0 ? (
          <Button variant="outline" onClick={() => go(step - 1)}>
            ← {steps[step - 1]!.label}
          </Button>
        ) : prev ? (
          <Button variant="ghost" onClick={() => onOpen(prev.slug)}>
            ← Aula {prev.order}
          </Button>
        ) : (
          <span />
        )}
        {!last ? (
          <Button onClick={() => go(step + 1)}>
            {steps[step + 1]!.label} →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
