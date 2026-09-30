import { ABOUT_DOES_NOT, ABOUT_FOR_WHO, aboutDefinition, aboutFaq, DATA_SOURCES, INVESTMENT_DISCLAIMER, type AboutFacts } from "@/lib/content/about";
import { GLOSSARY, glossaryPath } from "@/lib/content/glossary";
import { LESSONS, LEVEL_LABEL, lessonPath } from "@/lib/content/lessons";
import { TUTORIALS, tutorialPath, type Tutorial } from "@/lib/content/tutorials";
import { ASSETS } from "@/lib/assets";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { getEnv } from "@/lib/env";
import { landingFaq, salesFaq, type FaqItem } from "@/lib/marketing/faq";
import { PATTERN_LIST } from "@/lib/patterns/catalog";
import { billingNote, formatBRL, PLAN_FEATURES } from "@/lib/plans-copy";
import { CONTENT_REVISED, PAGE_SEO } from "@/lib/seo/pages";
import { SITE_URL } from "@/lib/site";
import { STRATEGY_TEMPLATES } from "@/lib/strategies/definition";
import { ADVANCED_TOOLS, MAIN_TOOLS } from "@/lib/tools";

/**
 * /llms.txt e /llms-full.txt (convenção https://llmstxt.org): resumo e texto completo do site para assistentes de IA.
 * Tudo é gerado dos módulos de conteúdo (aulas, tutoriais, planos, perguntas, glossário), a mesma fonte das páginas:
 * mudou a aula ou o tutorial, muda aqui. Sem números inventados; preços de PRICE_*_BRL; a chave interna PLATINUM nunca sai.
 */

export interface LlmsContext extends AboutFacts {
  siteUrl: string;
}

/** Fatos do ambiente (preços, canal de venda). Sem ambiente válido, usa os padrões de lib/env.ts. */
export function llmsContext(): LlmsContext {
  let prices = { PRO: 97, ELITE: 197 };
  let provider: LlmsContext["provider"] = "kiwify";
  try {
    const env = getEnv();
    prices = { PRO: env.PRICE_PRO_BRL, ELITE: env.PRICE_ELITE_BRL };
    provider = env.BILLING_PROVIDER;
  } catch {
    /* padrões acima */
  }
  return { siteUrl: SITE_URL, assets: ASSETS.length, patterns: PATTERN_LIST.length, lessons: LESSONS.length, tutorials: TUTORIALS.length, prices, trialDays: TRIAL_DAYS, provider };
}

const abs = (c: LlmsContext, path: string) => `${c.siteUrl}${path === "/" ? "" : path}`;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function summaryBlock(c: LlmsContext): string {
  return `> ${aboutDefinition(c)} Assinatura mensal: PRO ${formatBRL(c.prices.PRO)} e ELITE ${formatBRL(c.prices.ELITE)}, com ${c.trialDays} dias grátis no PRO, sem cartão. Site e suporte em português do Brasil.`;
}

function planLines(c: LlmsContext): string[] {
  return [
    `- PRO: ${formatBRL(c.prices.PRO)}/mês. Teste grátis de ${c.trialDays} dias, sem cartão. Inclui: ${PLAN_FEATURES.PRO.join("; ")}.`,
    `- ELITE: ${formatBRL(c.prices.ELITE)}/mês. Sem teste grátis. Inclui: ${PLAN_FEATURES.ELITE.join("; ")}.`,
    `- Cobrança: ${billingNote(c.provider)}`,
  ];
}

export function buildLlmsTxt(c: LlmsContext = llmsContext()): string {
  const L: string[] = [];
  L.push("# CryptoScanner", "", summaryBlock(c), "");
  L.push("Informações importantes:", "");
  for (const x of ABOUT_DOES_NOT) L.push(`- ${x}`);
  L.push(`- ${INVESTMENT_DISCLAIMER}`, `- Conteúdo revisado em ${CONTENT_REVISED}.`, "");

  L.push("## Produto", "");
  L.push(`- [O que é o CryptoScanner](${abs(c, "/sobre")}): definição, o que faz e o que não faz, como o modelo de sinais é testado, planos, fontes de dados e perguntas frequentes.`);
  L.push(`- [Página de vendas](${abs(c, "/vendas")}): ferramentas incluídas, números do modelo de rompimento medidos fora da amostra (com ressalvas), planos e perguntas frequentes.`);
  L.push(`- [Início](${abs(c, "/")}): visão geral, mercado ao vivo, simulador de aportes sem cadastro e planos.`);
  L.push(`- [Glossário de análise técnica e cripto](${abs(c, "/glossario")}): ${GLOSSARY.length} termos (candle, suporte, EMA, RSI, Fibonacci, funding, drawdown, R:R e outros) com links para as aulas.`);
  L.push(`- [Status do sistema](${abs(c, "/status")}): estado das fontes de dados e das rotinas automáticas.`, "");

  L.push("## Planos e preços", "");
  L.push(`- [Planos PRO e ELITE](${abs(c, "/planos")}): o que cada plano inclui, preço mensal, teste grátis e perguntas frequentes.`);
  L.push(...planLines(c), "");

  L.push(`## Tutoriais (${TUTORIALS.length})`, "");
  for (const t of TUTORIALS) L.push(`- [${t.title}](${abs(c, tutorialPath(t.slug))}): ${oneLine(t.summary)}`);
  L.push("");

  L.push(`## Jornada Trader (${LESSONS.length} aulas grátis, sem cadastro)`, "");
  L.push(`- [Jornada Trader](${abs(c, "/jornada")}): ${PAGE_SEO.jornada.description}`);
  for (const l of LESSONS) L.push(`- [Aula ${l.order}: ${l.title}](${abs(c, lessonPath(l.slug))}): ${LEVEL_LABEL[l.level]}, ${l.minutes} min. ${oneLine(l.summary)}`);
  L.push("");

  L.push("## Políticas", "");
  L.push(`- [Termos de Uso](${abs(c, "/termos")}): fornecedor, conta, teste grátis, planos e pagamento, cancelamento, responsabilidade.`);
  L.push(`- [Política de Privacidade](${abs(c, "/privacidade")}): dados tratados, bases legais, compartilhamento, retenção e direitos pela LGPD.`);
  L.push(`- [Cancelamento e Reembolso](${abs(c, "/reembolso")}): cancelamento a qualquer momento e arrependimento em até 7 dias com reembolso integral.`, "");

  L.push("## Contato e suporte", "");
  L.push(`- [Suporte](${abs(c, "/suporte")}): chamados de atendimento (com a conta aberta). Os dados do fornecedor e o e-mail de atendimento estão nos [Termos de Uso](${abs(c, "/termos")}), seção 1.`);
  L.push(`- [Central de tutoriais](${abs(c, "/ajuda")}): passo a passo de cada ferramenta.`, "");

  L.push("## Optional", "");
  L.push(`- [Texto completo para IA](${abs(c, "/llms-full.txt")}): aulas, tutoriais, planos, perguntas frequentes, glossário e avisos em um arquivo.`);
  L.push(`- [Mapa do site](${abs(c, "/sitemap.xml")}): todas as páginas públicas.`);
  return L.join("\n") + "\n";
}

function faqSection(items: FaqItem[]): string[] {
  const out: string[] = [];
  for (const [q, a] of items) out.push(`### ${q}`, "", a, "");
  return out;
}

function tutorialFull(c: LlmsContext, t: Tutorial): string[] {
  const L: string[] = [`### ${t.title}`, "", `URL: ${abs(c, tutorialPath(t.slug))}`, `Categoria: ${t.category}. Resumo: ${oneLine(t.summary)}`, ""];
  if (t.planNote) L.push(`Acesso: ${t.planNote}`);
  if (t.eliteNote) L.push(`ELITE: ${t.eliteNote}`);
  L.push(`Para que serve: ${t.purpose}`, "");
  if (t.before.length) L.push("Antes de começar:", ...t.before.map((b) => `- ${b}`), "");
  if (t.install) {
    L.push(`${t.install.title}:`);
    for (const g of t.install.groups) L.push(`- ${g.label}: ${g.steps.map((s) => s.text).join(" → ")}`);
    L.push("");
  }
  L.push("Passo a passo:", ...t.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`), "");
  if (t.tips.length) L.push("Dicas:", ...t.tips.map((x) => `- ${x}`), "");
  if (t.faq.length) L.push("Problemas comuns:", ...t.faq.map((f) => `- ${f.q} ${f.a}`), "");
  return L;
}

/** Perguntas das páginas (início, vendas/planos e sobre) sem repetir a mesma pergunta. */
function allFaq(c: LlmsContext): FaqItem[] {
  const seen = new Set<string>();
  return [...aboutFaq(c), ...salesFaq(c.trialDays, c.provider === "kiwify"), ...landingFaq(c.trialDays)].filter(([q]) => (seen.has(q) ? false : (seen.add(q), true)));
}

export function buildLlmsFullTxt(c: LlmsContext = llmsContext()): string {
  const L: string[] = [];
  L.push("# CryptoScanner — texto completo", "", summaryBlock(c), "");
  L.push(`Fonte: ${c.siteUrl}. Conteúdo revisado em ${CONTENT_REVISED}. Resumo com links: ${abs(c, "/llms.txt")}.`, "");
  L.push("## Aviso", "", INVESTMENT_DISCLAIMER, "", "O conteúdo, os sinais e as análises têm caráter informativo e educacional e são gerados por algoritmos a partir de dados públicos. O mercado de criptomoedas envolve alto risco, incluindo a perda total do capital investido. Cada pessoa é a única responsável pelas próprias decisões financeiras.", "");

  L.push("## O que é o CryptoScanner", "", aboutDefinition(c), "", "Para quem é:", ...ABOUT_FOR_WHO.map((x) => `- ${x}`), "", "O que ele não faz:", ...ABOUT_DOES_NOT.map((x) => `- ${x}`), "");

  L.push("## Ferramentas", "");
  for (const t of [...MAIN_TOOLS, ...ADVANCED_TOOLS]) L.push(`- ${t.name}: ${t.purpose}`);
  L.push("");
  L.push(`## Ativos monitorados (${ASSETS.length})`, "", ASSETS.map((a) => `${a.name} (${a.symbol})`).join(", ") + ".", "");
  L.push(`## Padrões gráficos detectados pelo scanner (${PATTERN_LIST.length})`, "", ...PATTERN_LIST.map((p) => `- ${p.label}: ${p.description}`), "");
  L.push("A confiança de cada padrão mede a aderência geométrica (proporções, simetria, recência); não é probabilidade de acerto.", "");

  L.push("## Modelo de sinais e como foi testado", "", "As regras foram escolhidas com dados de um período e medidas em outro período, que não foi usado na escolha (teste fora da amostra), descontando taxa e slippage. O setup que não passou nesse teste não é oferecido como estratégia. Resultado passado não garante resultado futuro.", "");
  for (const t of STRATEGY_TEMPLATES.filter((x) => x.validation)) {
    const v = t.validation!;
    L.push(`### ${t.name} — ${v.label}`, "", `Regra: ${t.description}`, "", `Metodologia e números: ${v.summary}`, "", `Ressalvas: ${v.caveats}`, "");
  }

  L.push("## Planos e preços", "", ...planLines(c), `- Página: ${abs(c, "/planos")}`, "");
  L.push("## Fontes de dados", "", ...DATA_SOURCES.map((d) => `- ${d.name}: ${d.use}.`), "");

  L.push("## Perguntas frequentes", "", ...faqSection(allFaq(c)));

  L.push(`## Jornada Trader — ${LESSONS.length} aulas grátis`, "", `${PAGE_SEO.jornada.description} Página: ${abs(c, "/jornada")}`, "");
  for (const l of LESSONS) {
    L.push(`### Aula ${l.order}: ${l.title}`, "", `URL: ${abs(c, lessonPath(l.slug))}`, `Nível: ${LEVEL_LABEL[l.level]}. Duração: ${l.minutes} min. Resumo: ${oneLine(l.summary)}`, "");
    for (const s of l.sections) L.push(`#### ${s.heading}`, "", s.body, "");
    L.push("Pontos-chave:", ...l.keyPoints.map((k) => `- ${k}`), "");
    L.push("Teste rápido:", ...l.quiz.map((q, i) => `${i + 1}. ${q.q} Resposta: ${q.options[q.answer] ?? ""}. ${q.why}`), "");
  }

  L.push(`## Tutoriais — ${TUTORIALS.length}`, "", `Central de tutoriais: ${abs(c, "/ajuda")}`, "");
  for (const t of TUTORIALS) L.push(...tutorialFull(c, t));

  L.push(`## Glossário — ${GLOSSARY.length} termos`, "", `Página: ${abs(c, "/glossario")}`, "");
  for (const g of GLOSSARY) L.push(`- ${g.term} (${abs(c, glossaryPath(g.id))}): ${g.definition}`);
  L.push("");

  L.push("## Políticas e contato", "");
  L.push(`- Termos de Uso: ${abs(c, "/termos")} (dados do fornecedor e e-mail de atendimento na seção 1)`);
  L.push(`- Política de Privacidade: ${abs(c, "/privacidade")}`);
  L.push(`- Cancelamento e Reembolso: ${abs(c, "/reembolso")}`);
  L.push(`- Suporte: ${abs(c, "/suporte")}`, "");
  L.push(INVESTMENT_DISCLAIMER);
  return L.join("\n") + "\n";
}

/** Cabeçalhos comuns: texto puro em UTF-8, cache de 1 h no navegador e 1 dia na CDN. */
export const LLMS_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  "X-Content-Type-Options": "nosniff",
};
