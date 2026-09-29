/**
 * Catálogo das ferramentas: UMA por finalidade. Usado no menu, na tela inicial e na página de venda,
 * para que o nome e a descrição de cada ferramenta sejam os mesmos em todo lugar.
 */
export type ToolIcon = "home" | "book" | "globe" | "bubbles" | "radar" | "bot" | "shield" | "candles" | "ruler" | "wallet" | "calculator" | "signal" | "workflow" | "activity" | "flask" | "gauge" | "target" | "chart" | "percent";

export interface Tool {
  href: string;
  name: string;
  icon: ToolIcon;
  /** uma frase: o que a ferramenta faz */
  purpose: string;
  /** rotas que acendem este item no menu */
  match?: string[];
  /** acende só com o caminho exato (evita conflito com sub-rotas de outra ferramenta) */
  exact?: boolean;
}

export const MAIN_TOOLS: Tool[] = [
  { href: "/", name: "Início", icon: "home", purpose: "Mercado agora, sinais ativos do modelo validado e atalhos para as ferramentas.", exact: true },
  { href: "/jornada", name: "Jornada", icon: "book", purpose: "12 aulas do Bitcoin à automação com agentes, com teste e prática no app." },
  { href: "/panorama", name: "Panorama", icon: "globe", purpose: "Resumo do mercado: capitalização, dominância, Medo & Ganância e os 30 ativos monitorados." },
  { href: "/bubbles", name: "Bolhas", icon: "bubbles", purpose: "Os 100 maiores ativos por volume em bolhas: tamanho = volume, cor = variação do período." },
  { href: "/scanner/padroes", name: "Scanner", icon: "radar", purpose: "Padrões gráficos em formação nos 30 ativos, com alvo, stop e taxa de acerto histórica.", match: ["/scanner/padroes"] },
  { href: "/agentes", name: "Agentes IA", icon: "bot", purpose: "Agentes que vigiam os ativos com a estratégia escolhida e avisam quando ela aparece." },
  { href: "/sentinela", name: "Sentinela", icon: "shield", purpose: "Vigia um ativo em vários padrões ao mesmo tempo, 24h no servidor, com plano de trade." },
  { href: "/graficos", name: "Gráficos", icon: "candles", purpose: "Candles ao vivo com EMA, Bollinger, StochRSI, MACD e suportes/resistências." },
  { href: "/fibonacci", name: "Fibonacci", icon: "ruler", purpose: "Retrações e extensões calculadas do último swing do ativo, ou de máxima e mínima manuais." },
  { href: "/carteira", name: "Carteira", icon: "wallet", purpose: "Favoritos, posições simuladas, alertas de preço e análises salvas." },
  { href: "/simulador", name: "Simulador", icon: "calculator", purpose: "Quanto teria rendido aportar (DCA mensal ou aporte único) com preços diários reais." },
];

/** Ferramentas de análise profunda: ficam num grupo recolhido do menu. */
export const ADVANCED_TOOLS: Tool[] = [
  { href: "/charts", name: "Análise completa", icon: "chart", purpose: "Estrutura, liquidez, suportes/resistências, Confluence Score, setup e derivativos de um ativo.", match: ["/charts"] },
  { href: "/scanner", name: "Scanner de setups", icon: "target", purpose: "Estado do setup, Confluence Score, regime e R:R nos 30 ativos.", exact: true },
  { href: "/strategies", name: "Construtor de estratégias", icon: "workflow", purpose: "Regras multi-timeframe próprias, com os modelos validados como ponto de partida." },
  { href: "/monitor", name: "Monitores", icon: "activity", purpose: "Monitores de setup e de estratégia avaliados no servidor, com notificação." },
  { href: "/backtest", name: "Backtest", icon: "flask", purpose: "Teste de estratégia com taxa, slippage e funding, curva de capital e drawdown." },
  { href: "/derivatives", name: "Derivativos", icon: "gauge", purpose: "Open interest, funding, basis e CVD dos perpétuos em Binance, Bybit e OKX." },
  { href: "/risco", name: "Gestão de risco", icon: "shield", purpose: "Tamanho de posição pelo risco, liquidação, preço médio e stress test." },
  { href: "/estatisticas", name: "Taxa de acerto", icon: "percent", purpose: "Backtest walk-forward e acompanhamento ao vivo dos padrões gráficos." },
];
