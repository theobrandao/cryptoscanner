"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, FlaskConical, Trophy, Wrench, X } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LessonQuestion } from "@/lib/content/lessons";
import { cn } from "@/lib/utils";
import { LAB_META, stepHeadingId } from "./lesson-lab-meta";
import { WIDGET_COMPONENTS } from "./lesson-widgets";
import { useLearningProgress } from "./use-learning-progress";

/**
 * Partes interativas da página da aula (/jornada/[slug]). O texto das partes, os pontos-chave e as perguntas
 * chegam prontos do servidor; aqui ficam só a navegação por etapas, o exercício e a correção do teste.
 */

type Step = { key: string; label: string };
type LessonLink = { href: string; order: number; title: string };

/** "smooth" só quando a pessoa não pediu menos movimento no sistema. */
function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

/** Alvos em que ← → têm função própria (campos, listas, grupos de opções, controles deslizantes). */
const ARROW_OWNERS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="radiogroup"], [role="radio"], [role="slider"], [role="tablist"], [role="menu"], [role="combobox"]';

const ActiveStepContext = React.createContext<string | null>(null);

/**
 * Etapas da aula: todas as partes ficam no HTML (as inativas com `hidden`), a barra mostra onde a pessoa está
 * e ← → do teclado avançam ou voltam.
 */
export function LessonStepper({ steps, panels, prev }: { steps: Step[]; panels: React.ReactNode[]; prev?: LessonLink }) {
  const [step, setStep] = React.useState(0);
  const nSteps = steps.length;
  const go = React.useCallback((n: number) => setStep(Math.max(0, Math.min(nSteps - 1, n))), [nSteps]);
  const cur = steps[step]!;
  const last = step === nSteps - 1;

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
    nav.querySelector('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center", behavior });
    if (nav.getBoundingClientRect().top < 64) window.scrollTo({ top: window.scrollY + nav.getBoundingClientRect().top - 80, behavior });
    document.getElementById(stepHeadingId(steps[step]!.key))?.focus({ preventScroll: true });
  }, [step, steps]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.closest?.(ARROW_OWNERS))) return;
      if (e.key === "ArrowRight") go(step + 1);
      else go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step]);

  return (
    <ActiveStepContext.Provider value={cur.key}>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((step + 1) / nSteps) * 100}%` }} />
      </div>

      <nav ref={navRef} aria-label="Etapas da aula" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(i)}
            aria-current={i === step ? "step" : undefined}
            className={cn("inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors", i === step ? "border-primary bg-primary text-primary-foreground" : i < step ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted")}
          >
            <span className="tabular text-xs opacity-80">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <Card className="p-5 sm:p-6">
        {panels.map((p, i) => (
          <div key={steps[i]!.key} hidden={i !== step} className={i === step ? "fade-up" : undefined}>
            {p}
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between gap-2">
        {step > 0 ? (
          <Button variant="outline" onClick={() => go(step - 1)}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> {steps[step - 1]!.label}
          </Button>
        ) : prev ? (
          <Link href={prev.href} className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Aula {prev.order}
          </Link>
        ) : (
          <span />
        )}
        {!last ? (
          <Button onClick={() => go(step + 1)}>
            {steps[step + 1]!.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </ActiveStepContext.Provider>
  );
}

/** Selo "concluída (x/y)" no topo da aula, lido do progresso salvo. */
export function LessonDoneBadge({ slug, quizLength }: { slug: string; quizLength: number }) {
  const { progress } = useLearningProgress();
  const saved = progress[slug];
  if (!saved?.done) return null;
  return (
    <span className="inline-flex items-center gap-1 text-primary">
      <Check className="h-3.5 w-3.5" aria-hidden /> concluída ({saved.score}/{quizLength})
    </span>
  );
}

/** Exercício interativo: o componente só monta quando a etapa é aberta pela primeira vez. */
export function LessonLab({ slug, stepKey }: { slug: string; stepKey: string }) {
  const active = React.useContext(ActiveStepContext) === stepKey;
  const [seen, setSeen] = React.useState(active);
  if (active && !seen) setSeen(true);
  const meta = LAB_META[slug];
  const Widget = WIDGET_COMPONENTS[slug];
  if (!meta || !Widget) return null;
  return (
    <section>
      <h2 id={stepHeadingId(stepKey)} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold outline-none">
        <FlaskConical className="h-4 w-4 text-primary" aria-hidden /> {meta.title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{meta.hint}</p>
      {seen ? <Widget /> : null}
    </section>
  );
}

/** Teste rápido: a resposta aparece ao escolher; "Corrigir e concluir aula" grava o progresso. */
export function LessonQuiz({ slug, stepKey, quiz, next, practice }: { slug: string; stepKey: string; quiz: LessonQuestion[]; next?: LessonLink; practice?: { href: string; label: string } }) {
  const { loggedIn, save, complete, retrySave } = useLearningProgress();
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [checked, setChecked] = React.useState(false);
  const score = quiz.filter((q, i) => answers[i] === q.answer).length;
  const saveStatus = save?.slug === slug ? save.status : undefined;

  // setas dentro de um grupo de respostas movem o foco entre as opções (a escolha continua sendo no clique/Enter)
  const onOptionsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const i = radios.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    radios[(i + dir + radios.length) % radios.length]?.focus();
  };

  const saveMsg = !loggedIn ? "Progresso salvo neste navegador." : saveStatus === "error" ? "Não conseguimos salvar na sua conta; o progresso ficou neste navegador." : saveStatus === "saving" ? "Salvando na sua conta…" : "Progresso salvo na sua conta.";

  return (
    <section>
      <h2 id={stepHeadingId(stepKey)} tabIndex={-1} className="text-lg font-semibold outline-none">
        Teste rápido
      </h2>
      <p className="text-sm text-muted-foreground">{quiz.length} perguntas. A resposta aparece assim que você escolhe.</p>
      <div className="mt-3 flex flex-col gap-3">
        {quiz.map((q, i) => {
          const answered = answers[i] !== undefined;
          const locked = answered || checked;
          const qid = `${slug}-q${i}`;
          return (
            <div key={q.q} className="rounded-lg border border-border p-4">
              <div id={qid} className="text-sm font-medium">
                {i + 1}. {q.q}
              </div>
              <div role="radiogroup" aria-labelledby={qid} onKeyDown={onOptionsKey} className="mt-2 flex flex-col gap-1.5">
                {q.options.map((o, j) => {
                  const sel = answers[i] === j;
                  const state = answered ? (j === q.answer ? "ok" : sel ? "bad" : "off") : "";
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
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors aria-disabled:cursor-default",
                        state === "ok" && "border-info bg-info/10",
                        state === "bad" && "border-warning bg-warning/10",
                        state === "off" && "border-border opacity-60",
                        state === "" && "border-border hover:border-primary/50 hover:bg-muted",
                      )}
                    >
                      <span className="flex w-4 shrink-0 justify-center text-center">
                        {state === "ok" ? (
                          <>
                            <Check className="h-4 w-4 text-info" aria-hidden />
                            <span className="sr-only">(correta)</span>
                          </>
                        ) : state === "bad" ? (
                          <>
                            <X className="h-4 w-4 text-warning" aria-hidden />
                            <span className="sr-only">(incorreta)</span>
                          </>
                        ) : (
                          <span aria-hidden>{String.fromCharCode(65 + j)}</span>
                        )}
                      </span>
                      {o}
                    </button>
                  );
                })}
              </div>
              <div role="status">
                {answered ? (
                  <p className={cn("mt-2 text-xs", answers[i] === q.answer ? "text-info" : "text-warning")}>
                    {answers[i] === q.answer ? "Correto. " : "Não é essa. "}
                    <span className="text-muted-foreground">{q.why}</span>
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
          disabled={Object.keys(answers).length < quiz.length}
          onClick={() => {
            setChecked(true);
            void complete(slug, score);
          }}
        >
          Corrigir e concluir aula
        </Button>
      ) : (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {score === quiz.length ? <Trophy className="h-6 w-6 text-primary" aria-hidden /> : <CircleCheck className="h-6 w-6 text-primary" aria-hidden />}
            <span className="font-semibold">Aula concluída</span>
            <Badge variant={score === quiz.length ? "default" : "warning"}>
              {score}/{quiz.length} corretas
            </Badge>
          </div>
          <div aria-live="polite">
            <p className="mt-1 text-sm text-muted-foreground">
              {saveMsg}
              {score < quiz.length ? " Vale reler a parte da pergunta que você errou." : ""}
            </p>
            {loggedIn && saveStatus === "error" ? (
              <Button variant="outline" size="sm" className="mt-2" onClick={retrySave}>
                Tentar de novo
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {next ? (
              <Link href={next.href} className={buttonVariants()}>
                Próxima aula: {next.title} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <Link href="/jornada" className={buttonVariants()}>
                Ver a trilha completa
              </Link>
            )}
            {practice ? (
              <Link href={practice.href} prefetch={false} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted">
                <Wrench className="h-4 w-4" aria-hidden /> {practice.label}
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
