"use client";

import * as React from "react";
import Link from "next/link";
import { GraduationCap, LifeBuoy, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CATEGORY_ANCHOR, TUTORIAL_CATEGORIES, type TutorialCategory } from "@/lib/content/tutorials";
import { cn } from "@/lib/utils";
import { TutorialCard, type TutorialCardData } from "./tutorial-card";

type Filter = "Todas" | TutorialCategory;

/** Texto sem acento e em minúsculas, para a busca achar "analise" em "Análise". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const BY_ANCHOR = new Map<string, TutorialCategory>(TUTORIAL_CATEGORIES.map((c) => [`cat-${CATEGORY_ANCHOR[c]}`, c]));

/** Categoria vinda do endereço (/ajuda#cat-mercado), lida sem efeito colateral para não divergir da renderização no servidor. */
function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const hashCategory = (): TutorialCategory | null => BY_ANCHOR.get(window.location.hash.slice(1)) ?? null;

/**
 * Central de tutoriais: busca por título e resumo, filtro por categoria e a faixa "Comece aqui".
 * Os cartões chegam prontos do servidor (sem o texto completo dos tutoriais).
 */
export function TutorialIndex({ tutorials, starters }: { tutorials: TutorialCardData[]; starters: TutorialCardData[] }) {
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Filter | null>(null);
  const fromHash = React.useSyncExternalStore(subscribeHash, hashCategory, () => null);
  const category: Filter = picked ?? fromHash ?? "Todas";
  const q = fold(query.trim());
  const shown = tutorials.filter((t) => (category === "Todas" || t.category === category) && (!q || fold(`${t.title} ${t.summary} ${t.category}`).includes(q)));
  const counts = new Map<Filter, number>([["Todas", tutorials.length], ...TUTORIAL_CATEGORIES.map((c) => [c, tutorials.filter((t) => t.category === c).length] as [Filter, number])]);
  const showStarters = !q && category === "Todas";

  const choose = (f: Filter) => {
    setPicked(f);
    try {
      const hash = f === "Todas" ? "" : `#cat-${CATEGORY_ANCHOR[f]}`;
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    } catch {
      /* navegador sem History API: o filtro continua funcionando */
    }
  };

  return (
    <>
      <Card className="card-glow mb-6 overflow-hidden">
        <CardContent className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">
              <GraduationCap className="h-3 w-3" aria-hidden /> Central de tutoriais
            </Badge>
            <span className="tabular text-xs text-muted-foreground">{tutorials.length} tutoriais · passo a passo com imagens</span>
          </div>
          <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[32px]">
            Como usar o <span className="text-gradient">CryptoScanner</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">Guias curtos para instalar o app, ativar os avisos e usar cada ferramenta: o que ela faz, o que precisa antes e o passo a passo com as telas do app.</p>
          <form role="search" className="relative mt-5 max-w-xl" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="busca-tutorial" className="sr-only">
              Buscar tutorial
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="busca-tutorial" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: scanner, Telegram, instalar…" autoComplete="off" spellCheck={false} className="h-11 pl-9 pr-10" />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground" aria-label="Limpar busca">
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {showStarters ? (
        <section aria-labelledby="comece-aqui" className="mb-8 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <h2 id="comece-aqui" className="text-lg font-semibold">
            Comece aqui
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Cadastro, instalação e avisos: o básico para usar o app no dia a dia.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {starters.map((t) => (
              <TutorialCard key={t.slug} t={t} highlight />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="todos-tutoriais">
        <div className="mb-4 flex flex-col gap-3">
          <h2 id="todos-tutoriais" className="text-lg font-semibold">
            {q ? "Resultado da busca" : "Todos os tutoriais"}
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
            {(["Todas", ...TUTORIAL_CATEGORIES] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={category === f}
                onClick={() => choose(f)}
                className={cn("inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", category === f ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted")}
              >
                {f}
                <span className="tabular text-xs text-muted-foreground">{counts.get(f) ?? 0}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {shown.length === 1 ? "1 tutorial" : `${shown.length} tutoriais`}
            {category !== "Todas" ? ` em ${category}` : ""}
            {q ? ` para “${query.trim()}”` : ""}
          </p>
        </div>

        {shown.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => (
              <TutorialCard key={t.slug} t={t} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="font-semibold">Nenhum tutorial encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente outra palavra, como “alerta”, “gráfico” ou “plano”.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                choose("Todas");
              }}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}
            >
              Limpar busca e filtros
            </button>
          </div>
        )}
      </section>

      <Card className="mt-8">
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
      <p className="mt-4 text-[13px] text-muted-foreground">
        Não conhece um termo? Veja o{" "}
        <Link href="/glossario" className="text-primary-text hover:underline">
          Glossário
        </Link>{" "}
        ou{" "}
        <Link href="/sobre" className="text-primary-text hover:underline">
          o que é o CryptoScanner
        </Link>
        .
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Conteúdo educativo. Não é recomendação de investimento.</p>
    </>
  );
}
