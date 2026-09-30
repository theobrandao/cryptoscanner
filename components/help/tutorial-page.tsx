import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, Lightbulb, LifeBuoy, ListChecks } from "lucide-react";
import { PlanBadge } from "@/components/brand/plan-badge";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { durationHint, pairStepMedia, type TutorialMedia } from "@/lib/content/tutorial-media";
import { termsForTutorial } from "@/lib/content/glossary";
import { CATEGORY_ANCHOR, getTutorial, TUTORIALS, tutorialPath, type Tutorial } from "@/lib/content/tutorials";
import { GlossaryTerms } from "./glossary-terms";
import { cn } from "@/lib/utils";
import { InstallNow } from "./install-now";
import { MediaPlaceholder } from "./media-placeholder";
import { MediaViewer } from "./media-viewer";
import { PLAN_TEXT, TutorialPlanTag } from "./plan-tag";
import { TutorialCard, type TutorialCardData } from "./tutorial-card";
import { TutorialIconView } from "./tutorial-icon";
import { ZoomableImage } from "./zoomable-image";

function H2({ id, icon, children }: { id: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <h2 id={id} className="flex scroll-mt-20 items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
      {icon ? (
        <span aria-hidden className="text-primary [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      ) : null}
      {children}
    </h2>
  );
}

/**
 * Página de um tutorial (componente de servidor): todo o texto vai pronto no HTML. No navegador rodam só a troca
 * vídeo/computador/celular, a ampliação das imagens e o atalho de instalação.
 */
export function TutorialPage({ tutorial: t, media, cardFor }: { tutorial: Tutorial; media: TutorialMedia | null; cardFor: (t: Tutorial) => TutorialCardData }) {
  const idx = TUTORIALS.findIndex((x) => x.slug === t.slug);
  const prev = TUTORIALS[idx - 1];
  const next = TUTORIALS[idx + 1];
  const related = t.related.map(getTutorial).filter((x): x is Tutorial => Boolean(x));
  const { byStep, extra } = pairStepMedia(t.steps, media?.steps ?? []);
  const hasViewer = Boolean(media && (media.video || media.cover || media.mobile));
  const cta = t.cta ?? "Abrir a ferramenta";

  return (
    <PageShell>
      <article className="mx-auto flex w-full max-w-5xl flex-col gap-8" aria-labelledby="tutorial-titulo">
        <div className="flex flex-col gap-4">
          <nav aria-label="Trilha de navegação">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <li>
                <Link href="/ajuda" className="inline-flex min-h-6 items-center hover:text-foreground">
                  Tutoriais
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="h-3 w-3" />
              </li>
              <li>
                <Link href={`/ajuda#cat-${CATEGORY_ANCHOR[t.category]}`} className="inline-flex min-h-6 items-center hover:text-foreground">
                  {t.category}
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="h-3 w-3" />
              </li>
              <li aria-current="page" className="min-w-0 truncate text-foreground">
                {t.title}
              </li>
            </ol>
          </nav>

          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden className="icon-tile grid h-11 w-11 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5">
                <TutorialIconView icon={t.icon} />
              </span>
              <div className="min-w-0">
                <h1 id="tutorial-titulo" className="text-[24px] font-bold leading-tight tracking-[-0.03em] sm:text-[30px]">
                  {t.title}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">{t.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <TutorialPlanTag plan={t.plan} />
                  <span>{PLAN_TEXT[t.plan]}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular">{durationHint(t.steps.length, media)}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href={t.route} className={buttonVariants({ variant: "primary" })}>
                {cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </header>

          {t.planNote || t.eliteNote ? (
            <div className="flex flex-col gap-2 text-sm">
              {t.planNote ? <p className="text-muted-foreground">{t.planNote}</p> : null}
              {t.eliteNote ? (
                <p className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--elite-border)] bg-[var(--elite-bg)] px-3 py-2">
                  <PlanBadge plan="ELITE" />
                  <span>{t.eliteNote}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <section aria-label="Vídeo e telas do tutorial" className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {hasViewer && media ? (
              <MediaViewer title={t.title} video={media.video} poster={media.poster} cover={media.cover} mobile={media.mobile} />
            ) : (
              <MediaPlaceholder icon={t.icon} label={`Ilustração: ${t.title}`} className="aspect-video w-full rounded-lg border border-border" />
            )}
          </div>
          <Card className="h-fit">
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-primary" aria-hidden /> Passo a passo
              </p>
              <ol className="mt-2 flex flex-col gap-1 text-sm">
                {t.steps.map((s, i) => (
                  <li key={s.title}>
                    <a href={`#passo-${i + 1}`} className="flex min-h-8 items-start gap-2 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
                      <span className="tabular mt-px w-4 shrink-0 text-right text-xs font-semibold text-primary-text">{i + 1}</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="para-que-serve" className="flex flex-col gap-2">
          <H2 id="para-que-serve">Para que serve</H2>
          <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{t.purpose}</p>
        </section>

        <section aria-labelledby="antes-de-comecar" className="flex flex-col gap-3">
          <H2 id="antes-de-comecar">Antes de começar</H2>
          <ul className="flex flex-col gap-2">
            {t.before.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        {t.install ? (
          <section aria-labelledby="como-instalar" className="flex flex-col gap-3">
            <H2 id="como-instalar">{t.install.title}</H2>
            {t.slug === "instalar-app" ? <InstallNow /> : null}
            <div className={cn("grid gap-4", t.install.groups.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
              {t.install.groups.map((g) => (
                <Card key={g.label}>
                  <CardContent className="p-4">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <span aria-hidden className="icon-tile grid h-8 w-8 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4">
                        <TutorialIconView icon={g.icon} />
                      </span>
                      {g.label}
                    </h3>
                    <ol className="mt-3 flex flex-col gap-3">
                      {g.steps.map((s, i) => (
                        <li key={s.text} className="flex items-start gap-3 text-sm">
                          <span className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                            <TutorialIconView icon={s.icon} />
                            <span className="tabular absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">{i + 1}</span>
                          </span>
                          <span className="min-w-0">{s.text}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="como-usar" className="flex flex-col gap-3">
          <H2 id="como-usar">Como usar</H2>
          <ol className="flex flex-col gap-3">
            {t.steps.map((s, i) => {
              const shot = byStep[i];
              return (
                <li key={s.title} id={`passo-${i + 1}`} className="scroll-mt-20 rounded-lg border border-border bg-card p-4">
                  <div className={cn("grid gap-4", shot ? "md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-start" : undefined)}>
                    <div className="flex items-start gap-3">
                      <span aria-hidden className="icon-tile tabular grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-snug">
                          <span className="sr-only">Passo {i + 1}: </span>
                          {s.title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                      </div>
                    </div>
                    {shot ? (
                      <figure className="min-w-0">
                        <ZoomableImage image={shot} alt={shot.caption || s.title} caption={shot.caption || undefined} sizes="(min-width: 768px) 320px, 100vw" />
                        {shot.caption ? <figcaption className="mt-1.5 text-xs text-muted-foreground">{shot.caption}</figcaption> : null}
                      </figure>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {extra.length ? (
            <div className="mt-2">
              <h3 className="text-sm font-semibold">Mais telas</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {extra.map((m) => (
                  <figure key={m.src} className="min-w-0">
                    <ZoomableImage image={m} alt={m.caption || t.title} caption={m.caption || undefined} sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw" />
                    {m.caption ? <figcaption className="mt-1.5 text-xs text-muted-foreground">{m.caption}</figcaption> : null}
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="dicas" className="flex flex-col gap-3">
          <H2 id="dicas" icon={<Lightbulb />}>
            Dicas
          </H2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {t.tips.map((tip) => (
              <li key={tip} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="problemas-comuns" className="flex flex-col gap-3">
          <H2 id="problemas-comuns" icon={<CircleHelp />}>
            Problemas comuns
          </H2>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {t.faq.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">{f.q}</span>
                  <span className="shrink-0 text-muted-foreground" aria-hidden>
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                </summary>
                <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <GlossaryTerms terms={termsForTutorial(t.slug)} title="Termos usados neste tutorial" id="termos-tutorial" />

        {related.length ? (
          <section aria-labelledby="relacionados" className="flex flex-col gap-3">
            <H2 id="relacionados">Tutoriais relacionados</H2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.slice(0, 3).map((r) => (
                <TutorialCard key={r.slug} t={cardFor(r)} />
              ))}
            </div>
          </section>
        ) : null}

        <nav aria-label="Outros tutoriais" className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {prev ? (
            <Link href={tutorialPath(prev.slug)} className="flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary/50 hover:bg-muted/40">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden /> Tutorial anterior
              </span>
              <span className="mt-0.5 font-semibold">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link href={tutorialPath(next.slug)} className="flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary/50 hover:bg-muted/40 sm:items-end sm:text-right">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Próximo tutorial <ArrowRight className="h-3 w-3" aria-hidden />
              </span>
              <span className="mt-0.5 font-semibold">{next.title}</span>
            </Link>
          ) : (
            <Link href="/ajuda" className="flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary/50 hover:bg-muted/40 sm:items-end sm:text-right">
              <span className="text-xs text-muted-foreground">Fim da lista</span>
              <span className="mt-0.5 font-semibold">Ver todos os tutoriais</span>
            </Link>
          )}
        </nav>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="icon-tile grid h-10 w-10 shrink-0 place-items-center rounded-xl" aria-hidden>
                <LifeBuoy className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">Ainda com dúvida?</h2>
                <p className="text-sm text-muted-foreground">Fale com o suporte: abra um chamado e acompanhe a resposta pelo app.</p>
              </div>
            </div>
            <Link href="/suporte" className={buttonVariants({ variant: "secondary" })}>
              Fale com o suporte
            </Link>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Conteúdo educativo. Não é recomendação de investimento.</p>
      </article>
    </PageShell>
  );
}
