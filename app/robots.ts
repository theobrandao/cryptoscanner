import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { DISALLOWED_PATHS, NAMED_CRAWLERS } from "@/lib/seo/robots";

/**
 * robots.txt — conteúdo público aberto a buscadores E a assistentes de IA (busca, citação e navegação a pedido do usuário).
 *
 * - Grupo "*" e grupo nomeado com as mesmas regras: um robô que encontra o próprio nome ignora o grupo "*",
 *   então cada grupo repete a lista de caminhos fechados.
 * - Robôs de IA liberados de propósito (skill ai-seo): quem bloqueia GPTBot/ClaudeBot/PerplexityBot/Google-Extended
 *   não aparece nas respostas desses assistentes. CCBot (Common Crawl) também fica liberado: o conteúdo é educativo e público.
 * - Fechados: API, painel do dono e telas de conta sem conteúdo para busca. As ferramentas continuam rastreáveis
 *   para que o `noindex` delas (layouts de cada rota) seja lido.
 * - Resumo para assistentes de IA: /llms.txt e texto completo em /llms-full.txt (convenção llmstxt.org).
 */
export default function robots(): MetadataRoute.Robots {
  const rule = { allow: "/", disallow: DISALLOWED_PATHS };
  return {
    rules: [
      { userAgent: "*", ...rule },
      { userAgent: NAMED_CRAWLERS, ...rule },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
