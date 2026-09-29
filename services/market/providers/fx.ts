import { fetchJson } from "@/lib/http";
import { getBinanceSpotPrice } from "@/services/market/providers/binance";
import { getUsdBrlRate as coingeckoUsdBrl } from "@/services/market/providers/coingecko";

/**
 * Câmbio USD→BRL com fontes em cascata (a primeira que responder vence; a fonte usada é devolvida):
 *   1. Binance USDT/BRL — mercado, tempo real (mesma base de preço dos ativos cripto)
 *   2. CoinGecko tether/BRL — agregado de mercado
 *   3. Banco Central do Brasil — PTAX venda do último dia útil (oficial; publicada 1×/dia)
 * USDT/BRL ≈ USD/BRL com prêmio/desconto pequeno; a fonte fica visível para o usuário.
 */
export interface FxQuote {
  rate: number;
  source: "binance-usdtbrl" | "coingecko-tether" | "bcb-ptax";
  label: string;
  /** horário da cotação na fonte (PTAX) ou da coleta */
  quotedAt: number;
}

const fmt = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;

/** PTAX (venda) mais recente dos últimos 10 dias — API Olinda do BCB, pública e sem chave. */
export async function getPtaxUsdBrl(now = new Date()): Promise<FxQuote> {
  const from = new Date(now.getTime() - 10 * 86_400_000);
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
    `?@dataInicial='${fmt(from)}'&@dataFinalCotacao='${fmt(now)}'&$format=json&$orderby=dataHoraCotacao%20desc&$top=1`;
  const r = await fetchJson<{ value: Array<{ cotacaoVenda: number; dataHoraCotacao: string }> }>(url, { retries: 1, timeoutMs: 8000 });
  const last = r.value[0];
  if (!last || !(last.cotacaoVenda > 0)) throw new Error("bcb: PTAX sem cotação no período");
  // dataHoraCotacao em horário de Brasília (UTC−3)
  const quotedAt = Date.parse(`${last.dataHoraCotacao.replace(" ", "T").slice(0, 19)}-03:00`);
  return { rate: last.cotacaoVenda, source: "bcb-ptax", label: "BCB PTAX (venda)", quotedAt: Number.isFinite(quotedAt) ? quotedAt : Date.now() };
}

export async function getUsdBrlQuote(): Promise<FxQuote> {
  const errors: string[] = [];
  try {
    return { rate: await getBinanceSpotPrice("USDTBRL"), source: "binance-usdtbrl", label: "Binance USDT/BRL", quotedAt: Date.now() };
  } catch (err) {
    errors.push((err as Error).message);
  }
  try {
    return { rate: await coingeckoUsdBrl(), source: "coingecko-tether", label: "CoinGecko USDT/BRL", quotedAt: Date.now() };
  } catch (err) {
    errors.push((err as Error).message);
  }
  try {
    return await getPtaxUsdBrl();
  } catch (err) {
    errors.push((err as Error).message);
  }
  throw new Error(`câmbio USD→BRL indisponível (${errors.join(" · ")})`);
}
