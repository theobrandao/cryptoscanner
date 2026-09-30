import { LESSONS, type Lesson } from "@/lib/content/lessons";
import type { Tutorial } from "@/lib/content/tutorials";

/**
 * Título e descrição de cada página pública (fonte única, conferida em tests/unit/seo-pages.test.ts):
 * título completo (com " — CryptoScanner" quando não é absoluto) com até 60 caracteres e descrição de 120 a 155.
 */
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 155;
export const TITLE_SUFFIX = " — CryptoScanner";

/** Data da última revisão do conteúdo público (sitemap e "Atualizado em" das páginas institucionais). */
export const CONTENT_REVISED = "2026-09-30";

export interface PageSeo {
  path: string;
  title: string;
  description: string;
  /** o título já é completo (não recebe " — CryptoScanner") */
  absoluteTitle?: boolean;
}

export const PAGE_SEO = {
  home: { path: "/", title: "CryptoScanner — scanner cripto com sinais testados e alertas", absoluteTitle: true, description: "Padrões gráficos, sinais de rompimento testados fora da amostra, agentes com alertas, gráficos, Fibonacci, simulador e aulas. 3 dias grátis no PRO." },
  vendas: { path: "/vendas", title: "CryptoScanner — padrões, sinais testados e alertas de cripto", absoluteTitle: true, description: "Scanner de 17 padrões gráficos, modelo de rompimento testado fora da amostra e agentes com alertas para 30 criptos. 3 dias grátis no PRO, sem cartão." },
  planos: { path: "/planos", title: "Planos PRO e ELITE", description: "Planos PRO e ELITE do CryptoScanner: o que cada um inclui, 3 dias grátis no PRO sem cartão e arrependimento em até 7 dias com reembolso integral." },
  jornada: { path: "/jornada", title: "Jornada Trader: curso grátis de análise técnica de cripto", absoluteTitle: true, description: "Curso grátis de análise técnica de cripto, sem cadastro: 12 aulas curtas do Bitcoin à gestão de risco, com exercícios e teste rápido." },
  ajuda: { path: "/ajuda", title: "Tutoriais: como usar o CryptoScanner", description: "Passo a passo para instalar o app, ativar notificações, conectar o Telegram e usar scanner, gráficos, agentes, alertas e simulador." },
  sobre: { path: "/sobre", title: "O que é o CryptoScanner", description: "O que o CryptoScanner faz e o que não faz: análise técnica de 30 criptomoedas, modelo testado fora da amostra, alertas, planos, fontes de dados e dúvidas." },
  glossario: { path: "/glossario", title: "Glossário de análise técnica e cripto", description: "Termos de análise técnica e cripto em linguagem simples: candle, suporte, EMA, RSI, Fibonacci, funding, drawdown, R:R e outros, com links para as aulas." },
  termos: { path: "/termos", title: "Termos de Uso", description: "Termos de Uso do CryptoScanner: conta, teste grátis, planos e pagamento, cancelamento e responsabilidade. O conteúdo não é recomendação de investimento." },
  privacidade: { path: "/privacidade", title: "Política de Privacidade", description: "Política de Privacidade do CryptoScanner: dados tratados, finalidades e bases legais, compartilhamento, retenção e seus direitos pela LGPD." },
  reembolso: { path: "/reembolso", title: "Cancelamento e Reembolso", description: "Como cancelar a assinatura do CryptoScanner e pedir reembolso: arrependimento em até 7 dias com reembolso integral e acesso até o fim do período pago." },
  status: { path: "/status", title: "Status do sistema", description: "Estado das fontes de dados de mercado, das rotinas automáticas e dos serviços do CryptoScanner, atualizado a cada minuto, com divergência Binance × Kraken." },
} satisfies Record<string, PageSeo>;

/** Título como aparece na aba (com o sufixo do modelo do layout quando não é absoluto). */
export function fullTitle(p: Pick<PageSeo, "title" | "absoluteTitle">): string {
  return p.absoluteTitle ? p.title : `${p.title}${TITLE_SUFFIX}`;
}

/** Primeiro complemento que mantém a descrição dentro do limite (ou a base, se nenhum couber). */
export function fitDescription(base: string, extras: string[]): string {
  for (const x of extras) if ((base + x).length <= DESCRIPTION_MAX) return base + x;
  return base;
}

/** Primeiro título candidato (já completo) que cabe em 60 caracteres. */
function fitTitle(candidates: Array<{ title: string; absoluteTitle: boolean }>): { title: string; absoluteTitle: boolean } {
  return candidates.find((c) => fullTitle(c).length <= TITLE_MAX) ?? candidates[candidates.length - 1]!;
}

export function lessonSeo(lesson: Lesson): PageSeo {
  const t = fitTitle([
    { title: `${lesson.title} · Jornada Trader`, absoluteTitle: true },
    { title: lesson.title, absoluteTitle: false },
    { title: lesson.title, absoluteTitle: true },
  ]);
  const description = fitDescription(`Aula ${lesson.order} de ${LESSONS.length} da Jornada Trader: ${lesson.summary}`, [" Grátis, com teste rápido e sem cadastro.", " Grátis, com teste rápido.", " Aula grátis."]);
  return { path: `/jornada/${lesson.slug}`, ...t, description };
}

export function tutorialSeo(t: Pick<Tutorial, "slug" | "title" | "summary">): PageSeo {
  const title = fitTitle([
    { title: `${t.title} · Tutorial`, absoluteTitle: false },
    { title: t.title, absoluteTitle: false },
    { title: t.title, absoluteTitle: true },
  ]);
  const description = fitDescription(t.summary, [" Tutorial passo a passo do CryptoScanner.", " Passo a passo do CryptoScanner.", " Passo a passo."]);
  return { path: `/ajuda/${t.slug}`, ...title, description };
}
