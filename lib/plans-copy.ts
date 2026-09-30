/**
 * Textos dos planos compartilhados pela página de vendas, landing e página de planos (cliente e servidor).
 * Números de limite vêm de lib/entitlements (fonte única).
 */
import { ENTITLEMENTS, TRIAL_DAYS } from "@/lib/entitlements";
/** Limites de scanner/agentes do ELITE vêm da camada legada (chave interna PLATINUM). */
import { PLANS } from "@/lib/plans";
import { ADVANCED_TOOLS, MAIN_TOOLS } from "@/lib/tools";

export type PaidPlan = "PRO" | "ELITE";
export type BillingProvider = "mercadopago" | "kiwify";

const pro = ENTITLEMENTS.PRO;
const elite = ENTITLEMENTS.ELITE;

export const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  PRO: [
    "Todas as ferramentas: Scanner, Agentes IA, Sentinela, Gráficos, Fibonacci, Carteira, Simulador e Jornada",
    "Sinais do modelo de rompimento testado fora da amostra (4H e 1D)",
    "Avançado: Análise completa, Scanner de setups, Derivativos (Binance, Bybit e OKX) e Gestão de risco",
    `${pro.maxMonitors} monitores no servidor, ${pro.maxAlerts} alertas, push e Telegram`,
    `Construtor de estratégias: ${pro.maxStrategies} estratégias`,
    `Backtest de um timeframe com taxas, slippage e funding · ${Math.round(pro.historyDays / 365)} ano de histórico`,
    `Análise por IA com números verificados: ${pro.aiQueriesPerDay} consultas/dia`,
  ],
  ELITE: [
    "Tudo do PRO",
    "Backtest multi-timeframe",
    `${Math.round(elite.historyDays / 365)} anos de histórico no backtest`,
    `${elite.maxMonitors} monitores, ${elite.maxAlerts} alertas e ${elite.maxStrategies} estratégias`,
    `Análise por IA: ${elite.aiQueriesPerDay} consultas/dia`,
    "Scanner também em 1H, 30M e 15M",
    `Até ${PLANS.PLATINUM.maxAgents} agentes e ${PLANS.PLATINUM.maxSentinels} Sentinelas`,
  ],
};

const ELITE_ALL_OF_PRO = "Tudo do PRO";

/** Só o que o ELITE tem a mais que o PRO (fonte: PLAN_FEATURES.ELITE, sem "Tudo do PRO"). Usado no bloco e no modal do ELITE. */
export const ELITE_DIFFERENTIALS: string[] = PLAN_FEATURES.ELITE.filter((f) => f !== ELITE_ALL_OF_PRO);

/** Preço mensal em reais como aparece na tela ("R$ 97", "R$ 97,90"). O valor vem de PRICE_*_BRL (servidor). */
export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Caminhos do suporte com o assunto já indicado (o formulário de /suporte lê `assunto`). */
export const SUPPORT_PATHS = {
  payment: "/suporte?assunto=pagamento",
  cancel: `/suporte?assunto=${encodeURIComponent("Cancelar assinatura")}`,
  reactivate: `/suporte?assunto=${encodeURIComponent("Reativar renovação")}`,
} as const;

/** Chaves curtas de `?assunto=` → assunto escrito por extenso no formulário. */
const SUPPORT_SUBJECTS: Record<string, string> = { pagamento: "Problema com o pagamento" };

/**
 * Assunto inicial do formulário de /suporte a partir de `?assunto=` (links de pagamento, cancelamento e reativação).
 * Chave conhecida vira o texto por extenso; outro texto entra como veio se couber no campo (3 a 120 caracteres).
 */
export function supportSubjectFromParam(raw: string | string[] | null | undefined): string {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const known = SUPPORT_SUBJECTS[value.toLowerCase()];
  if (known) return known;
  return value.length >= 3 && value.length <= 120 ? value : "";
}

/** Motivos opcionais do cancelamento (chave = valor aceito no evento cancel_reason). */
export const CANCEL_REASON_LABELS: Array<{ key: "preco" | "pouco_uso" | "falta_recurso" | "problema_tecnico" | "outra_ferramenta" | "outro"; label: string }> = [
  { key: "preco", label: "O preço está alto para mim" },
  { key: "pouco_uso", label: "Não estou usando o suficiente" },
  { key: "falta_recurso", label: "Falta um recurso de que preciso" },
  { key: "problema_tecnico", label: "Tive problemas técnicos" },
  { key: "outra_ferramenta", label: "Vou usar outra ferramenta" },
  { key: "outro", label: "Outro motivo" },
];

/**
 * Uma linha de benefício por ferramenta nas telas de bloqueio. Só descreve o que a ferramenta faz no app (lib/tools);
 * ferramenta sem linha própria usa a descrição do catálogo.
 */
const GATE_BENEFITS: Record<string, string> = {
  Panorama: "Veja capitalização, dominância, Medo & Ganância e os 30 ativos monitorados em um só lugar.",
  Bolhas: "Veja os 100 maiores ativos por volume e quem mais subiu ou caiu no período.",
  Scanner: "Encontre padrões gráficos em formação nos 30 ativos, com alvo, stop e taxa de acerto histórica.",
  "Agentes IA": "Agentes vigiam os ativos com a estratégia escolhida e avisam por push ou Telegram quando ela aparece.",
  Sentinela: "Vigie um ativo em vários padrões ao mesmo tempo, 24h no servidor, com plano de trade.",
  Gráficos: "Candles ao vivo com EMA, Bollinger, StochRSI, MACD e suportes e resistências.",
  Fibonacci: "Retrações e extensões calculadas do último swing do ativo, sem traçar à mão.",
  "Analista IA": "Pergunte sobre qualquer ativo e receba a resposta com os números do scanner, dos sinais e do panorama.",
  Carteira: "Favoritos, posições simuladas, alertas de preço e análises salvas em um só lugar.",
  Simulador: "Veja quanto teria rendido aportar (DCA mensal ou aporte único) com preços diários reais.",
  "Análise completa": "Estrutura, liquidez, níveis, Confluence Score e derivativos de um ativo numa leitura só.",
  "Scanner de setups": "Estado do setup, Confluence Score, regime e risco/retorno nos 30 ativos.",
  "Construtor de estratégias": "Monte regras próprias em vários tempos gráficos, partindo dos modelos validados.",
  Monitores: "Monitores avaliados no servidor avisam quando o setup ou a estratégia aparece.",
  Backtest: "Teste a estratégia com taxa, slippage e funding e veja a curva de capital e o drawdown.",
  Derivativos: "Open interest, funding, basis e CVD dos perpétuos em Binance, Bybit e OKX.",
  "Gestão de risco": "Calcule o tamanho da posição pelo risco, o preço de liquidação e o preço médio.",
  "Taxa de acerto": "Veja o desempenho histórico e ao vivo de cada padrão gráfico, com a metodologia.",
  "Sinais do modelo testado": "Sinais do modelo de rompimento testado fora da amostra, no 4H e no 1D.",
};
/** Nomes antigos ou variações usados pelas telas → nome da ferramenta no catálogo. */
const GATE_ALIASES: Record<string, string> = { Strategies: "Construtor de estratégias", "Derivativos — detalhes": "Derivativos" };

export function gateCopy(feature: string): { title: string; benefit: string } {
  const title = GATE_ALIASES[feature] ?? feature;
  const tool = [...MAIN_TOOLS, ...ADVANCED_TOOLS].find((t) => t.name === title);
  return { title, benefit: GATE_BENEFITS[title] ?? tool?.purpose ?? "Faz parte das ferramentas dos planos PRO e ELITE." };
}

export const PROVIDER_LABEL: Record<BillingProvider, string> = {
  mercadopago: "Mercado Pago",
  kiwify: "Kiwify",
};

/** Nota de rodapé de cobrança, cancelamento e arrependimento. */
export function billingNote(provider: BillingProvider): string {
  const via = PROVIDER_LABEL[provider];
  return provider === "kiwify"
    ? `Pagamento mensal recorrente processado pela ${via}. Use no cadastro o mesmo e-mail da compra: o acesso é liberado automaticamente. Cancelamento a qualquer momento; o acesso segue até o fim do período pago. Arrependimento em até 7 dias da compra com reembolso integral.`
    : `Pagamento mensal recorrente via ${via} (cartão). Cancelamento a qualquer momento; o acesso segue até o fim do período pago. Arrependimento em até 7 dias da primeira cobrança com reembolso integral.`;
}

export const TRIAL_TEXT = `${TRIAL_DAYS} dias grátis no PRO, sem cartão`;
