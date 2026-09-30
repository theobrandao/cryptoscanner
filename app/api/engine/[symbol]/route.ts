import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { parseTimeframe } from "@/lib/timeframes";
import { getEngineReport } from "@/services/engine-service";
import { requireCoreUser } from "@/services/subscription-service";

const querySchema = z.object({ timeframe: z.string().default("4h"), candles: z.enum(["0", "1"]).default("0") });

/** Estrutura de mercado (externa/interna), mapa de liquidez e matriz multi-timeframe de um ativo. */
export const GET = withApi(async (req, ctx) => {
  await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const { symbol } = await ctx.params;
  const sym = symbolSchema.parse((symbol ?? "").toUpperCase());
  const q = parseQuery(req, querySchema);
  const report = await getEngineReport(sym, parseTimeframe(q.timeframe));
  return ok(q.candles === "1" ? report : { ...report, candles: undefined });
});
