import { connection } from "next/server";
import { z } from "zod";
import { ApiError, enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getBubbles, getUsdBrl } from "@/services/market/market-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(10).max(100).default(100),
  currency: z.enum(["USD", "BRL"]).default("USD"),
});

/** Mapa de bolhas: os 100 maiores ativos por volume 24h com variação em 1h/24h/7d/30d (CoinGecko, sem stablecoins/wrapped). */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const res = await getBubbles(q.limit);
  if (!res) throw new ApiError(503, "Dados de mercado indisponíveis no momento", "upstream_unavailable");
  const fx = q.currency === "BRL" ? await getUsdBrl() : null;
  const rate = fx && Number.isFinite(fx.rate) ? fx.rate : 1;
  const bubbles = rate === 1 ? res.bubbles : res.bubbles.map((b) => ({ ...b, price: b.price * rate, marketCap: b.marketCap * rate, volume24h: b.volume24h * rate }));
  return ok({ bubbles, count: bubbles.length, currency: q.currency, usdBrl: fx?.rate ?? null, stale: res.stale, fetchedAt: res.fetchedAt, source: "coingecko", periods: ["1h", "24h", "7d", "30d"] });
});
