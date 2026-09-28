import { connection } from "next/server";
import { enforceRateLimit, ok, withApi } from "@/lib/api";
import { getGlobalMarket, getMarketCaps, getUsdBrl } from "@/services/market/market-service";
import { getFearGreed } from "@/services/sentiment/fear-greed";

/** Panorama: dados globais (CoinGecko), market caps do universo, câmbio e Medo & Ganância. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const [global, markets, fx, fng] = await Promise.all([getGlobalMarket(), getMarketCaps(), getUsdBrl(), getFearGreed().catch(() => null)]);
  return ok({
    global: global ? { ...global.data, stale: global.stale, source: "coingecko" } : null,
    markets: markets ? { items: markets.markets, stale: markets.stale, source: "coingecko" } : null,
    usdBrl: fx,
    fearGreed: fng ? { ...fng.data, stale: fng.stale } : null,
  });
});
