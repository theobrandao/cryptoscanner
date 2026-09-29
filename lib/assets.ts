import type { AssetDefinition } from "@/types/market";

/**
 * Universo de ativos monitorados pelo scanner (21).
 * A referência pública menciona "20 ativos" e lista 10 na home; os demais foram escolhidos entre os
 * pares USDT de maior liquidez que também existem na Kraken (fallback). ZEC adicionado a pedido (ZECUSDT / Kraken XZECZUSD).
 * Os glifos são caracteres Unicode próprios, não logotipos de terceiros.
 */
export const ASSETS: readonly AssetDefinition[] = [
  { symbol: "BTC", name: "Bitcoin", binancePair: "BTCUSDT", krakenPair: "XBTUSD", coingeckoId: "bitcoin", glyph: "₿", sortOrder: 1 },
  { symbol: "ETH", name: "Ethereum", binancePair: "ETHUSDT", krakenPair: "ETHUSD", coingeckoId: "ethereum", glyph: "Ξ", sortOrder: 2 },
  { symbol: "BNB", name: "BNB", binancePair: "BNBUSDT", krakenPair: "BNBUSD", coingeckoId: "binancecoin", glyph: "⬡", sortOrder: 3 },
  { symbol: "SOL", name: "Solana", binancePair: "SOLUSDT", krakenPair: "SOLUSD", coingeckoId: "solana", glyph: "◎", sortOrder: 4 },
  { symbol: "XRP", name: "XRP", binancePair: "XRPUSDT", krakenPair: "XRPUSD", coingeckoId: "ripple", glyph: "✦", sortOrder: 5 },
  { symbol: "ADA", name: "Cardano", binancePair: "ADAUSDT", krakenPair: "ADAUSD", coingeckoId: "cardano", glyph: "●", sortOrder: 6 },
  { symbol: "DOGE", name: "Dogecoin", binancePair: "DOGEUSDT", krakenPair: "XDGUSD", coingeckoId: "dogecoin", glyph: "Ð", sortOrder: 7 },
  { symbol: "AVAX", name: "Avalanche", binancePair: "AVAXUSDT", krakenPair: "AVAXUSD", coingeckoId: "avalanche-2", glyph: "▲", sortOrder: 8 },
  { symbol: "DOT", name: "Polkadot", binancePair: "DOTUSDT", krakenPair: "DOTUSD", coingeckoId: "polkadot", glyph: "◈", sortOrder: 9 },
  { symbol: "LINK", name: "Chainlink", binancePair: "LINKUSDT", krakenPair: "LINKUSD", coingeckoId: "chainlink", glyph: "⬢", sortOrder: 10 },
  { symbol: "POL", name: "Polygon", binancePair: "POLUSDT", krakenPair: "POLUSD", coingeckoId: "polygon-ecosystem-token", glyph: "⬟", sortOrder: 11 },
  { symbol: "LTC", name: "Litecoin", binancePair: "LTCUSDT", krakenPair: "LTCUSD", coingeckoId: "litecoin", glyph: "Ł", sortOrder: 12 },
  { symbol: "TRX", name: "TRON", binancePair: "TRXUSDT", krakenPair: "TRXUSD", coingeckoId: "tron", glyph: "▼", sortOrder: 13 },
  { symbol: "ATOM", name: "Cosmos", binancePair: "ATOMUSDT", krakenPair: "ATOMUSD", coingeckoId: "cosmos", glyph: "⚛", sortOrder: 14 },
  { symbol: "UNI", name: "Uniswap", binancePair: "UNIUSDT", krakenPair: "UNIUSD", coingeckoId: "uniswap", glyph: "◇", sortOrder: 15 },
  { symbol: "NEAR", name: "NEAR Protocol", binancePair: "NEARUSDT", krakenPair: "NEARUSD", coingeckoId: "near", glyph: "◐", sortOrder: 16 },
  { symbol: "APT", name: "Aptos", binancePair: "APTUSDT", krakenPair: "APTUSD", coingeckoId: "aptos", glyph: "◑", sortOrder: 17 },
  { symbol: "ARB", name: "Arbitrum", binancePair: "ARBUSDT", krakenPair: "ARBUSD", coingeckoId: "arbitrum", glyph: "◒", sortOrder: 18 },
  { symbol: "OP", name: "Optimism", binancePair: "OPUSDT", krakenPair: "OPUSD", coingeckoId: "optimism", glyph: "◓", sortOrder: 19 },
  { symbol: "SUI", name: "Sui", binancePair: "SUIUSDT", krakenPair: "SUIUSD", coingeckoId: "sui", glyph: "◔", sortOrder: 20 },
  { symbol: "ZEC", name: "Zcash", binancePair: "ZECUSDT", krakenPair: "ZECUSD", coingeckoId: "zcash", glyph: "ⓩ", sortOrder: 21 },
] as const;

const BY_SYMBOL = new Map(ASSETS.map((a) => [a.symbol, a]));
const BY_BINANCE = new Map(ASSETS.map((a) => [a.binancePair, a]));

export function getAsset(symbol: string): AssetDefinition | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function getAssetByBinancePair(pair: string): AssetDefinition | undefined {
  return BY_BINANCE.get(pair.toUpperCase());
}

export function isKnownSymbol(symbol: string): boolean {
  return BY_SYMBOL.has(symbol.toUpperCase());
}

export const ASSET_SYMBOLS: readonly string[] = ASSETS.map((a) => a.symbol);
