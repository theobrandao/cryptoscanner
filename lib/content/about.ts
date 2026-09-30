import type { FaqItem } from "@/lib/marketing/faq";
import { formatBRL, PROVIDER_LABEL, type BillingProvider } from "@/lib/plans-copy";

/**
 * Textos de "O que é o CryptoScanner" (/sobre) e do resumo para assistentes de IA (/llms.txt, /llms-full.txt).
 * Só fatos do código e de .agents/product-marketing.md; números vêm dos módulos de origem (catálogos, env, entitlements).
 */
export interface AboutFacts {
  assets: number;
  patterns: number;
  lessons: number;
  tutorials: number;
  prices: { PRO: number; ELITE: number };
  trialDays: number;
  provider: BillingProvider;
}

/** Fontes de dados de mercado citadas no rodapé do app (components/layout/app-shell.tsx). */
export const DATA_SOURCES: Array<{ name: string; use: string }> = [
  { name: "Binance", use: "preços, candles e derivativos (fonte principal)" },
  { name: "Bybit e OKX", use: "derivativos dos contratos perpétuos" },
  { name: "Kraken", use: "preços quando a Binance está fora do ar" },
  { name: "CoinGecko e CoinPaprika", use: "capitalização e dados globais do mercado" },
  { name: "BCB (PTAX)", use: "câmbio do dólar em reais" },
  { name: "alternative.me", use: "índice Medo & Ganância" },
];

export const INVESTMENT_DISCLAIMER = "Conteúdo técnico e educacional; não é recomendação de investimento. Criptoativos têm alta volatilidade e risco de perda do capital. Resultados históricos, inclusive fora da amostra, não garantem resultados futuros.";

/** Parágrafo de definição (resposta direta para "o que é o CryptoScanner"). */
export function aboutDefinition(f: AboutFacts): string {
  return `O CryptoScanner é uma aplicação web brasileira de análise técnica de criptomoedas. Ele acompanha ${f.assets} criptomoedas, detecta ${f.patterns} padrões gráficos, calcula níveis, Confluence Score e os sinais de um modelo de rompimento testado fora da amostra, e avisa por push e Telegram quando uma condição escolhida aparece. Inclui ainda gráficos, Fibonacci, simulador, backtest e a Jornada Trader, com ${f.lessons} aulas grátis. Não é corretora, não executa ordens e não faz recomendação de investimento.`;
}

export const ABOUT_FOR_WHO = [
  "Quem opera ou investe em criptomoedas e usa (ou quer aprender) análise técnica.",
  "Quem não pode acompanhar gráfico o dia inteiro e prefere ser avisado quando uma condição aparece.",
  "Quem está começando e quer uma trilha organizada: a Jornada Trader é grátis e não exige cadastro.",
];

export const ABOUT_DOES_NOT = [
  "Não é corretora nem exchange: não compra, não vende e não guarda criptomoedas.",
  "Não executa ordens e nunca pede chaves de API da sua corretora; usa só dados públicos de mercado.",
  "Não faz recomendação de investimento nem promete resultado: a decisão é sempre sua.",
];

/** Perguntas da página /sobre (mesmos itens no HTML e no JSON-LD FAQPage). */
export function aboutFaq(f: AboutFacts): FaqItem[] {
  const via = PROVIDER_LABEL[f.provider];
  return [
    ["O que é o CryptoScanner?", aboutDefinition(f)],
    ["O CryptoScanner é uma corretora?", "Não. Ele não compra, não vende e não guarda criptomoedas, não executa ordens e nunca pede chaves de API da sua corretora. Usa apenas dados públicos de mercado para calcular as análises."],
    ["O CryptoScanner faz recomendação de investimento?", "Não. As ferramentas calculam padrões, níveis e sinais com regras fixas e mostram de onde vem cada número. O conteúdo é técnico e educacional, e a decisão de operar é sempre sua."],
    ["Quais criptomoedas o CryptoScanner acompanha?", `${f.assets} criptomoedas, entre elas Bitcoin, Ethereum, Solana, XRP e Cardano. O scanner procura ${f.patterns} padrões gráficos nesses ativos nos tempos gráficos de 4H, 1D e 1W; o plano ELITE acrescenta 1H, 30M e 15M.`],
    ["Quanto custa o CryptoScanner?", `O PRO custa ${formatBRL(f.prices.PRO)} por mês e o ELITE, ${formatBRL(f.prices.ELITE)} por mês, com pagamento mensal recorrente pela ${via}. O PRO tem teste grátis de ${f.trialDays} dias, sem cartão.`],
    ["Tem teste grátis?", `Sim. O plano PRO pode ser testado por ${f.trialDays} dias, sem cartão e sem cobrança automática ao final. O ELITE não tem teste. Quando o teste termina, o acesso às ferramentas é pausado e seus dados continuam salvos.`],
    ["Como o modelo de sinais foi testado?", "As regras do modelo de rompimento foram escolhidas com dados de um período e medidas em outro período, que não foi usado na escolha, descontando taxa e slippage, em 30 criptomoedas. Os números e as ressalvas estão publicados na página de vendas. Resultado passado não garante resultado futuro."],
    ["De onde vêm os dados?", `De fontes públicas de mercado: ${DATA_SOURCES.map((d) => d.name).join(", ")}. Cada número mostra a fonte e o horário do dado.`],
    ["Dá para aprender sem pagar?", `Sim. A Jornada Trader tem ${f.lessons} aulas grátis de análise técnica, sem cadastro, e a Central de ajuda tem ${f.tutorials} tutoriais abertos. O glossário explica os termos usados nas aulas e nas ferramentas.`],
    ["Como cancelo e peço reembolso?", "O cancelamento pode ser feito a qualquer momento, sem multa, e o acesso segue até o fim do período pago. Na primeira contratação, o pedido em até 7 dias garante reembolso integral."],
  ];
}
