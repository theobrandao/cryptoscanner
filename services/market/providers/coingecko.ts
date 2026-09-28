import type { AssetDefinition } from "@/types/market";
import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";

/**
 * CoinGecko — API pública (chave opcional, aumenta o limite).
 * Usada para câmbio USD→BRL, capitalização de mercado e dados globais (dominância, volume total).
 */
function headers(): Record<string, string> {
  const key = getEnv().COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

export interface CoinMarket {
  id: string;
  symbol: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  circulating_supply: number;
  last_updated: string;
}

export async function getCoinMarkets(assets: readonly AssetDefinition[], vs = "usd"): Promise<CoinMarket[]> {
  const ids = assets.map((a) => a.coingeckoId).join(",");
  const url = `${getEnv().COINGECKO_REST_URL}/coins/markets?vs_currency=${vs}&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h,7d`;
  return fetchJson<CoinMarket[]>(url, { headers: headers(), retries: 1 });
}

export async function getUsdBrlRate(): Promise<number> {
  const url = `${getEnv().COINGECKO_REST_URL}/simple/price?ids=tether&vs_currencies=brl,usd`;
  const res = await fetchJson<{ tether?: { brl?: number; usd?: number } }>(url, { headers: headers(), retries: 1 });
  const brl = res.tether?.brl;
  const usd = res.tether?.usd ?? 1;
  if (!brl || !usd) throw new Error("coingecko: câmbio BRL indisponível");
  return brl / usd;
}

export interface GlobalData {
  total_market_cap: Record<string, number>;
  total_volume: Record<string, number>;
  market_cap_percentage: Record<string, number>;
  market_cap_change_percentage_24h_usd: number;
  active_cryptocurrencies: number;
  updated_at: number;
}

export async function getGlobal(): Promise<GlobalData> {
  const url = `${getEnv().COINGECKO_REST_URL}/global`;
  const res = await fetchJson<{ data: GlobalData }>(url, { headers: headers(), retries: 1 });
  return res.data;
}

export interface MarketBubbleRaw {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number | null;
  total_volume: number;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

/** Stablecoins e tokens "espelho" (wrapped/staked) excluídos do mapa de bolhas — não representam movimento de preço. */
const EXCLUDED_SYMBOLS = new Set([
  "usdt", "usdc", "dai", "fdusd", "usde", "usds", "tusd", "usd1", "pyusd", "busd", "usdd", "frax", "eurc", "eurt", "usdtb", "rlusd", "gusd", "lusd", "crvusd", "susds", "susde", "usd0", "usdy", "buidl", "usdg", "ausd",
  "wbtc", "weth", "steth", "wsteth", "cbbtc", "weeth", "reth", "bnsol", "jitosol", "msol", "wbeth", "cbeth", "ezeth", "rseth", "tbtc", "lbtc", "sbtc", "wbnb", "solvbtc", "bsc-usd", "wtrx", "whype",
]);

/** Top N ativos por volume (24h) com variação em 1h/24h/7d/30d — uma única requisição. */
export async function getMarketBubbles(limit = 100, vs = "usd"): Promise<MarketBubbleRaw[]> {
  const url = `${getEnv().COINGECKO_REST_URL}/coins/markets?vs_currency=${vs}&order=volume_desc&per_page=${Math.min(250, limit + 60)}&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d`;
  const raw = await fetchJson<MarketBubbleRaw[]>(url, { headers: headers(), retries: 1 });
  return raw.filter((c) => c.current_price > 0 && c.total_volume > 0 && !EXCLUDED_SYMBOLS.has(c.symbol.toLowerCase())).slice(0, limit);
}
