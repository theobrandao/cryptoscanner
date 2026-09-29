import { fetchJson } from "@/lib/http";
import type { GlobalData, MarketBubbleRaw } from "@/services/market/providers/coingecko";

/**
 * Fontes alternativas à CoinGecko para dados agregados (capitalização, volume, dominância, variações):
 * CoinPaprika (free: até 200 ativos por chamada, ~60 req/h) e CoinLore (sem 30d). Públicas, sem chave.
 * A saída usa o mesmo formato da CoinGecko para não duplicar lógica; a fonte é informada pelo chamador.
 */
interface PaprikaTicker {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  quotes: { USD: { price: number; volume_24h: number; market_cap: number; percent_change_1h: number | null; percent_change_24h: number | null; percent_change_7d: number | null; percent_change_30d: number | null } };
}

/** Top `limit` por rank (máx. 200 no plano gratuito); o chamador ordena por volume e remove stablecoins. */
export async function getPaprikaMarkets(limit = 200): Promise<MarketBubbleRaw[]> {
  const raw = await fetchJson<PaprikaTicker[]>(`https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=${Math.min(200, limit)}`, { retries: 1, timeoutMs: 12_000 });
  return raw.map((t) => ({
    id: t.id,
    symbol: t.symbol.toLowerCase(),
    name: t.name,
    image: "",
    current_price: t.quotes.USD.price,
    market_cap: t.quotes.USD.market_cap,
    market_cap_rank: t.rank || null,
    total_volume: t.quotes.USD.volume_24h,
    price_change_percentage_1h_in_currency: t.quotes.USD.percent_change_1h,
    price_change_percentage_24h_in_currency: t.quotes.USD.percent_change_24h,
    price_change_percentage_7d_in_currency: t.quotes.USD.percent_change_7d,
    // plano gratuito devolve 0 fixo em 30d/1y: tratado como ausente (nunca exibir zero inventado)
    price_change_percentage_30d_in_currency: null,
  }));
}

interface CoinLoreTicker {
  id: string;
  symbol: string;
  name: string;
  nameid: string;
  rank: number;
  price_usd: string;
  percent_change_1h: string;
  percent_change_24h: string;
  percent_change_7d: string;
  market_cap_usd: string;
  volume24: number;
}

/** Top `limit` por rank em páginas de 100 (máx. da API por chamada). */
export async function getCoinLoreMarkets(limit = 200): Promise<MarketBubbleRaw[]> {
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(Math.min(300, limit) / 100) }, (_, i) =>
      fetchJson<{ data: CoinLoreTicker[] }>(`https://api.coinlore.net/api/tickers/?start=${i * 100}&limit=100`, { retries: 1, timeoutMs: 10_000 }),
    ),
  );
  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return pages.flatMap((p) => p.data).map((t) => ({
    id: t.nameid,
    symbol: t.symbol.toLowerCase(),
    name: t.name,
    image: "",
    current_price: Number(t.price_usd),
    market_cap: Number(t.market_cap_usd),
    market_cap_rank: t.rank || null,
    total_volume: t.volume24,
    price_change_percentage_1h_in_currency: n(t.percent_change_1h),
    price_change_percentage_24h_in_currency: n(t.percent_change_24h),
    price_change_percentage_7d_in_currency: n(t.percent_change_7d),
    price_change_percentage_30d_in_currency: null,
  }));
}

/** Dados globais via CoinPaprika no formato GlobalData (apenas os campos que a interface usa). */
export async function getPaprikaGlobal(): Promise<GlobalData> {
  const g = await fetchJson<{ market_cap_usd: number; volume_24h_usd: number; bitcoin_dominance_percentage: number; cryptocurrencies_number: number; market_cap_change_24h: number; last_updated: number }>(
    "https://api.coinpaprika.com/v1/global",
    { retries: 1, timeoutMs: 8000 },
  );
  return {
    total_market_cap: { usd: g.market_cap_usd },
    total_volume: { usd: g.volume_24h_usd },
    market_cap_percentage: { btc: g.bitcoin_dominance_percentage },
    market_cap_change_percentage_24h_usd: g.market_cap_change_24h,
    active_cryptocurrencies: g.cryptocurrencies_number,
    updated_at: g.last_updated,
  };
}
