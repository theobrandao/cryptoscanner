import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, requireUser, withApi } from "@/lib/api";
import { VENUES } from "@/lib/venues";
import { requireEntitlement } from "@/services/subscription-service";
import { getDerivativesDetail } from "@/services/derivatives-detail-service";

export const maxDuration = 30;

/** View Details de derivativos: comparativo Binance/Bybit/OKX + histórico (funding, OI, CVD aproximado). */
export const GET = withApi(async (req, ctx) => {
  await connection();
  await enforceRateLimit(req, "public");
  await requireEntitlement(await requireUser(req));
  const { symbol } = await ctx.params;
  const sym = symbolSchema.parse((symbol ?? "").toUpperCase().replace(/USDT$/, ""));
  const q = parseQuery(req, z.object({ exchange: z.enum(VENUES).default("binance") }));
  return ok(await getDerivativesDetail(sym, q.exchange));
});
