import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { GLOSSARY, glossaryLetter, type GlossaryTerm } from "@/lib/content/glossary";
import { getLesson, LESSONS, lessonPath } from "@/lib/content/lessons";
import { getTutorial, tutorialPath } from "@/lib/content/tutorials";
import { breadcrumbLd, definedTermSetLd, JsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { CONTENT_REVISED, PAGE_SEO } from "@/lib/seo/pages";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.glossario);

const dateBR = (iso: string) => iso.split("-").reverse().join("/");

function groupByLetter(terms: GlossaryTerm[]): Array<[string, GlossaryTerm[]]> {
  const map = new Map<string, GlossaryTerm[]>();
  for (const t of terms) {
    const k = glossaryLetter(t);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()];
}

/**
 * Glossário (estático, indexável): verbetes em ordem alfabética com âncora própria (/glossario#id), índice por letra,
 * links para as aulas e tutoriais relacionados e JSON-LD DefinedTermSet com os mesmos textos.
 */
export default function GlossaryPage() {
  const groups = groupByLetter(GLOSSARY);
  return (
    <>
      <JsonLd data={[definedTermSetLd(GLOSSARY), breadcrumbLd([["Início", "/"], ["Glossário", "/glossario"]])]} />
      <PageShell>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <PageTitle
            title="Glossário de análise técnica e cripto"
            description={`${GLOSSARY.length} termos usados nas aulas da Jornada Trader e nas ferramentas do CryptoScanner, em linguagem simples. Atualizado em ${dateBR(CONTENT_REVISED)}.`}
          />
          <nav aria-label="Índice alfabético" className="sticky top-14 z-10 -mx-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
            <ol className="flex flex-wrap gap-1">
              {groups.map(([letter]) => (
                <li key={letter}>
                  <a href={`#letra-${letter}`} className="grid h-8 min-w-8 place-items-center rounded-md border border-border px-2 text-[13px] font-semibold hover:border-primary/50 hover:text-primary-text">
                    {letter}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {groups.map(([letter, terms]) => (
            <section key={letter} aria-labelledby={`letra-${letter}`} className="flex flex-col gap-3">
              <h2 id={`letra-${letter}`} className="scroll-mt-28 text-lg font-semibold text-primary-text">
                {letter}
              </h2>
              <dl className="flex flex-col gap-3">
                {terms.map((t) => {
                  const lessons = t.lessons.map(getLesson).filter((l) => l !== undefined);
                  const tutorials = t.tutorials.map(getTutorial).filter((x) => x !== undefined);
                  return (
                    <div key={t.id} id={t.id} className="scroll-mt-28 rounded-lg border border-border bg-card p-4">
                      <dt className="text-[15px] font-semibold">
                        <a href={`#${t.id}`} className="hover:underline">
                          {t.term}
                        </a>
                      </dt>
                      <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.definition}</dd>
                      {lessons.length || tutorials.length ? (
                        <dd className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                          {lessons.map((l) => (
                            <Link key={l.slug} href={lessonPath(l.slug)} className="inline-flex min-h-6 items-center text-primary-text hover:underline">
                              Aula {l.order}: {l.title}
                            </Link>
                          ))}
                          {tutorials.map((x) => (
                            <Link key={x.slug} href={tutorialPath(x.slug)} className="inline-flex min-h-6 items-center text-primary-text hover:underline">
                              Tutorial: {x.title}
                            </Link>
                          ))}
                        </dd>
                      ) : null}
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}

          <p className="text-[13px] text-muted-foreground">
            Quer aprender em ordem? A{" "}
            <Link href="/jornada" className="text-primary-text hover:underline">
              Jornada Trader
            </Link>{" "}
            tem {LESSONS.length} aulas grátis, sem cadastro. Para usar as ferramentas, veja os{" "}
            <Link href="/ajuda" className="text-primary-text hover:underline">
              tutoriais
            </Link>
            .
          </p>
          <p className="text-xs text-muted-foreground">Conteúdo educativo. Não é recomendação de investimento.</p>
        </div>
      </PageShell>
    </>
  );
}
