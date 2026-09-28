export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}

/** Navegação principal (rótulos equivalentes aos observados na referência, ícones em Unicode). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/panorama", label: "Panorama Diário", icon: "🌐" },
  { href: "/bubbles", label: "Bubbles", icon: "🫧" },
  { href: "/scanner", label: "Scanner", icon: "📊" },
  { href: "/agentes", label: "Agentes IA", icon: "🤖", badge: "Novo" },
  { href: "/sentinela", label: "Sentinela", icon: "🛰️", badge: "Novo" },
  { href: "/graficos", label: "Gráficos", icon: "📈" },
  { href: "/fibonacci", label: "Fibonacci", icon: "📐" },
  { href: "/carteira", label: "Carteira", icon: "💼", badge: "Novo" },
  { href: "/simulador", label: "Simulações", icon: "📜" },
  { href: "/planos", label: "Planos", icon: "💳" },
  { href: "/suporte", label: "Suporte", icon: "🆘" },
];

export const FOOTER_LINKS = [
  { href: "/", label: "Início" },
  { href: "/fibonacci", label: "Fibonacci" },
  { href: "/agentes", label: "Agentes" },
  { href: "/scanner", label: "Scanner" },
  { href: "/graficos", label: "Gráficos" },
];

export const DISCLAIMER_TEXT =
  "O conteúdo, os sinais e as análises desta plataforma têm caráter exclusivamente informativo e educacional e são gerados por algoritmos a partir de dados públicos. O mercado de criptomoedas envolve alto risco, incluindo a perda total do capital investido. Você é o único responsável por suas decisões financeiras.";
