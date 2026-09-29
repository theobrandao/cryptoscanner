/**
 * Textos dos planos compartilhados pela página de vendas, landing e página de planos (cliente e servidor).
 * Números de limite vêm de lib/entitlements (fonte única).
 */
import { ENTITLEMENTS, TRIAL_DAYS } from "@/lib/entitlements";

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
  ],
};

export const PROVIDER_LABEL: Record<BillingProvider, string> = { mercadopago: "Mercado Pago", kiwify: "Kiwify" };

/** Nota de rodapé de cobrança, cancelamento e arrependimento. */
export function billingNote(provider: BillingProvider): string {
  const via = PROVIDER_LABEL[provider];
  return provider === "kiwify"
    ? `Pagamento mensal recorrente processado pela ${via}. Use no cadastro o mesmo e-mail da compra: o acesso é liberado automaticamente. Cancelamento a qualquer momento; o acesso segue até o fim do período pago. Arrependimento em até 7 dias da compra com reembolso integral.`
    : `Pagamento mensal recorrente via ${via} (cartão). Cancelamento a qualquer momento; o acesso segue até o fim do período pago. Arrependimento em até 7 dias da primeira cobrança com reembolso integral.`;
}

export const TRIAL_TEXT = `${TRIAL_DAYS} dias grátis no PRO, sem cartão`;
