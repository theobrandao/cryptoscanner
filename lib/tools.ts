/**
 * Catálogo das ferramentas: UMA por finalidade. Usado no menu, na tela inicial e na página de venda,
 * para que o nome e a descrição de cada ferramenta sejam os mesmos em todo lugar.
 */
export type ToolIcon = "home" | "book" | "globe" | "bubbles" | "radar" | "bot" | "shield" | "candles" | "ruler" | "wallet" | "calculator" | "signal" | "workflow" | "activity" | "flask" | "gauge" | "target" | "chart" | "percent" | "sparkles";

export type ToolCategory = "Início" | "Mercado" | "Análise" | "Automação" | "Planejamento" | "Aprender" | "Avançado";

export interface Tool {
  href: string;
  name: string;
  icon: ToolIcon;
  category: ToolCategory;
  /** 2–3 marcadores curtos exibidos nos cartões */
  chips?: string[];
  /** selo curto no menu e nos cartões (ex.: "12 aulas") */
  badge?: string;
  /** uma frase: o que a ferramenta faz */
  purpose: string;
  /** rotas que acendem este item no menu */
  match?: string[];
  /** acende só com o caminho exato (evita conflito com sub-rotas de outra ferramenta) */
  exact?: boolean;
}

export const MAIN_TOOLS: Tool[] = [
  { href: "/", name: "Início", icon: "home", category: "Início", purpose: "Mercado agora, sinais ativos do modelo validado e atalhos para as ferramentas.", exact: true },
  { href: "/jornada", name: "Jornada", icon: "book", category: "Aprender", badge: "12 aulas", chips: ["Iniciante a avançado", "Teste por aula"], purpose: "12 aulas do Bitcoin à automação com agentes, com teste e prática no app." },
  { href: "/panorama", name: "Panorama", icon: "globe", category: "Mercado", chips: ["Diário", "Notícias", "Ciclo"], purpose: "Resumo do mercado: capitalização, dominância, Medo & Ganância e os 30 ativos monitorados." },
  { href: "/bubbles", name: "Bolhas", icon: "bubbles", category: "Mercado", chips: ["Top 100", "1h a 30d"], purpose: "Os 100 maiores ativos por volume em bolhas: tamanho = volume, cor = variação do período." },
  { href: "/scanner/padroes", name: "Scanner", icon: "radar", category: "Análise", chips: ["17 padrões", "30 ativos", "Taxa de acerto"], purpose: "Padrões gráficos em formação nos 30 ativos, com alvo, stop e taxa de acerto histórica.", match: ["/scanner/padroes"] },
  { href: "/agentes", name: "Agentes IA", icon: "bot", category: "Automação", chips: ["Estratégias prontas", "Push e Telegram"], purpose: "Agentes que vigiam os ativos com a estratégia escolhida e avisam quando ela aparece." },
  { href: "/sentinela", name: "Sentinela", icon: "shield", category: "Automação", chips: ["24h", "Multipadrão", "Plano de trade"], purpose: "Vigia um ativo em vários padrões ao mesmo tempo, 24h no servidor, com plano de trade." },
  { href: "/graficos", name: "Gráficos", icon: "candles", category: "Análise", chips: ["Ao vivo", "Indicadores"], purpose: "Candles ao vivo com EMA, Bollinger, StochRSI, MACD e suportes/resistências." },
  { href: "/fibonacci", name: "Fibonacci", icon: "ruler", category: "Análise", chips: ["Retrações", "Extensões"], purpose: "Retrações e extensões calculadas do último swing do ativo, ou de máxima e mínima manuais." },
  { href: "/analista", name: "Analista IA", icon: "sparkles", category: "Análise", chips: ["Conversa", "Só números do app"], purpose: "Converse sobre qualquer ativo: o analista consulta scanner, sinais, taxa de acerto e panorama e responde com os números." },
  { href: "/carteira", name: "Carteira", icon: "wallet", category: "Planejamento", chips: ["Favoritos", "Alertas de preço"], purpose: "Favoritos, posições simuladas, alertas de preço e análises salvas." },
  { href: "/simulador", name: "Simulador", icon: "calculator", category: "Planejamento", chips: ["DCA", "Aporte único", "Preços reais"], purpose: "Quanto teria rendido aportar (DCA mensal ou aporte único) com preços diários reais." },
];

/** Ferramentas de análise profunda: ficam num grupo recolhido do menu. */
export const ADVANCED_TOOLS: Tool[] = [
  { href: "/charts", name: "Análise completa", icon: "chart", category: "Avançado", purpose: "Estrutura, liquidez, suportes/resistências, Confluence Score, setup e derivativos de um ativo.", match: ["/charts"] },
  { href: "/scanner", name: "Scanner de setups", icon: "target", category: "Avançado", purpose: "Estado do setup, Confluence Score, regime e R:R nos 30 ativos.", exact: true },
  { href: "/strategies", name: "Construtor de estratégias", icon: "workflow", category: "Avançado", purpose: "Regras multi-timeframe próprias, com os modelos validados como ponto de partida." },
  { href: "/monitor", name: "Monitores", icon: "activity", category: "Avançado", purpose: "Monitores de setup e de estratégia avaliados no servidor, com notificação." },
  { href: "/backtest", name: "Backtest", icon: "flask", category: "Avançado", purpose: "Teste de estratégia com taxa, slippage e funding, curva de capital e drawdown." },
  { href: "/derivatives", name: "Derivativos", icon: "gauge", category: "Avançado", purpose: "Open interest, funding, basis e CVD dos perpétuos em Binance, Bybit e OKX." },
  { href: "/risco", name: "Gestão de risco", icon: "shield", category: "Avançado", purpose: "Tamanho de posição pelo risco, liquidação, preço médio e stress test." },
  { href: "/estatisticas", name: "Taxa de acerto", icon: "percent", category: "Avançado", purpose: "Backtest walk-forward e acompanhamento ao vivo dos padrões gráficos." },
];

/** Ordem das categorias no menu e nas páginas (referência: organização por tipo de tarefa). */
export const TOOL_CATEGORIES: Array<{ key: Exclude<ToolCategory, "Início" | "Avançado">; label: string; purpose: string }> = [
  { key: "Mercado", label: "Mercado", purpose: "Como o mercado está hoje" },
  { key: "Análise", label: "Análise", purpose: "Ler o gráfico e os padrões" },
  { key: "Automação", label: "Automação", purpose: "Vigiar os ativos por você" },
  { key: "Planejamento", label: "Planejamento", purpose: "Carteira, aportes e risco" },
  { key: "Aprender", label: "Aprender", purpose: "Entender antes de operar" },
];
