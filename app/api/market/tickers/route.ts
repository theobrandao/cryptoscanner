import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getTickers, getUsdBrl } from "@/services/market/market-service";

const querySchema = z.object({
  /** BRL converte price/high24h/low24h/quoteVolume24h no servidor (câmbio CoinGecko). */
  currency: z.enum(["USD", "BRL"]).default("USD"),
  /** 1 = inclui o câmbio USD→BRL no payload sem converter (uso da interface, que converte no cliente). */
  fx: z.enum(["1", "0"]).optional(),
  refresh: z.enum(["1", "0"]).optional(),
});

export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const res = await getTickers({ refresh: q.refresh === "1" });
  const wantsFx = q.currency === "BRL" || q.fx === "1";
  const fx = wantsFx ? await getUsdBrl() : null;
  const rate = q.currency === "BRL" && fx ? fx.rate : 1;
  const tickers =
    rate === 1
      ? res.tickers
      : res.tickers.map((t) => ({ ...t, price: t.price * rate, high24h: t.high24h * rate, low24h: t.low24h * rate, quoteVolume24h: t.quoteVolume24h * rate }));
  return ok({ ...res, tickers, currency: q.currency, usdBrl: fx?.rate ?? null, fxStale: fx?.stale ?? false });
});
