/**
 * Rota da ferramenta → tutorial (/ajuda/<slug>). Módulo leve (sem o texto dos tutoriais) para uso no navegador,
 * como no link "Como usar" das telas de bloqueio. A consistência com lib/content/tutorials.ts é verificada em teste.
 */
const PATHS: Array<{ prefix: string; slug: string; exact?: boolean; title: string }> = [
  { prefix: "/scanner/padroes", slug: "scanner", title: "Scanner de padrões" },
  { prefix: "/scanner", slug: "scanner-setups", exact: true, title: "Scanner de setups" },
  { prefix: "/charts", slug: "analise-completa", title: "Análise completa" },
  { prefix: "/terminal", slug: "analise-completa", title: "Análise completa" },
  { prefix: "/graficos", slug: "graficos", title: "Gráficos" },
  { prefix: "/fibonacci", slug: "fibonacci", title: "Fibonacci" },
  { prefix: "/panorama", slug: "panorama", title: "Panorama" },
  { prefix: "/bubbles", slug: "bolhas", title: "Mapa de Bolhas" },
  { prefix: "/analista", slug: "analista-ia", title: "Analista IA" },
  { prefix: "/agentes", slug: "agentes-ia", title: "Agentes IA" },
  { prefix: "/sentinela", slug: "sentinela", title: "Sentinela" },
  { prefix: "/monitor", slug: "monitores-alertas", title: "Monitores e alertas" },
  { prefix: "/carteira", slug: "carteira", title: "Carteira" },
  { prefix: "/simulador", slug: "simulador", title: "Simulador" },
  { prefix: "/backtest", slug: "backtest", title: "Backtest" },
  { prefix: "/strategies", slug: "construtor-estrategias", title: "Construtor de estratégias" },
];

export function tutorialForPath(path: string | null | undefined): { slug: string; title: string; href: string } | null {
  const p = (path ?? "").split(/[?#]/)[0] || "/";
  const hit = PATHS.find((x) => (x.exact ? p === x.prefix : p === x.prefix || p.startsWith(x.prefix + "/")));
  return hit ? { slug: hit.slug, title: hit.title, href: `/ajuda/${hit.slug}` } : null;
}

export const TUTORIAL_PATH_SLUGS: readonly string[] = [...new Set(PATHS.map((x) => x.slug))];
