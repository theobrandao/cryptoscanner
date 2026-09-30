import type { MetadataRoute } from "next";
import { LESSONS, lessonPath } from "@/lib/content/lessons";
import { TUTORIALS, tutorialPath } from "@/lib/content/tutorials";
import { getEnv } from "@/lib/env";
import { SITE_URL } from "@/lib/site";
import { CONTENT_REVISED } from "@/lib/seo/pages";

/**
 * Só páginas públicas com conteúdo próprio: início, vendas, planos, sobre, glossário, Jornada (lista e cada aula), tutoriais
 * (lista e cada um) e documentos legais. /llms.txt e /llms-full.txt não entram (não são páginas; ver app/robots.ts).
 * Ferramentas exigem conta; login, cadastro e estado do sistema ficam fora (baixo valor para busca).
 * `lastModified`: data da última revisão do conteúdo (atualizar ao mudar a página); nos documentos legais,
 * a versão vigente dos termos (LEGAL_TERMS_VERSION).
 */
// CONTENT_REVISED: lib/seo/pages.ts (também exibida como "Atualizado em" em /sobre e /glossario)

function legalRevised(): string {
  try {
    const v = getEnv().LEGAL_TERMS_VERSION;
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : CONTENT_REVISED;
  } catch {
    return CONTENT_REVISED;
  }
}

type Freq = "daily" | "weekly" | "monthly" | "yearly";

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = legalRevised();
  const pages: Array<{ path: string; freq: Freq; priority: number; revised: string }> = [
    { path: "/", freq: "weekly", priority: 1, revised: CONTENT_REVISED },
    { path: "/vendas", freq: "weekly", priority: 0.9, revised: CONTENT_REVISED },
    { path: "/planos", freq: "monthly", priority: 0.8, revised: CONTENT_REVISED },
    { path: "/sobre", freq: "monthly", priority: 0.7, revised: CONTENT_REVISED },
    { path: "/glossario", freq: "monthly", priority: 0.6, revised: CONTENT_REVISED },
    { path: "/jornada", freq: "monthly", priority: 0.8, revised: CONTENT_REVISED },
    ...LESSONS.map((l) => ({ path: lessonPath(l.slug), freq: "monthly" as const, priority: 0.7, revised: CONTENT_REVISED })),
    { path: "/ajuda", freq: "monthly", priority: 0.7, revised: CONTENT_REVISED },
    ...TUTORIALS.map((t) => ({ path: tutorialPath(t.slug), freq: "monthly" as const, priority: 0.6, revised: CONTENT_REVISED })),
    { path: "/termos", freq: "yearly", priority: 0.2, revised: legal },
    { path: "/privacidade", freq: "yearly", priority: 0.2, revised: legal },
    { path: "/reembolso", freq: "yearly", priority: 0.2, revised: legal },
  ];
  return pages.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, lastModified: p.revised, changeFrequency: p.freq, priority: p.priority }));
}
