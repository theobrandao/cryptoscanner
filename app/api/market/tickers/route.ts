import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getTickers, getUsdBrl } from "@/services/market/market-service";

const querySchema = z.object({
  currency: z.enum(["USD", "BRL"]).default("USD"),
  refresh: z.enum(["1", "0"]).optional(),
});

export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const res = await getTickers({ refresh: q.refresh === "1" });
  const fx = q.currency === "BRL" ? await getUsdBrl() : null;
  return ok({ ...res, currency: q.currency, usdBrl: fx?.rate ?? null, fxStale: fx?.stale ?? false });
});
