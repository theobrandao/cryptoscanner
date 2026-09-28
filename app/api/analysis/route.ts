import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { parseTimeframe } from "@/lib/timeframes";
import { analyzeAsset, jsonSafe } from "@/services/analysis-service";

const querySchema = z.object({
  symbol: symbolSchema,
  timeframe: z.string().default("4h"),
  sentiment: z.enum(["1", "0"]).default("1"),
  llm: z.enum(["1", "0"]).default("1"),
  refresh: z.enum(["1", "0"]).default("0"),
});

/** Análise consolidada pelo orquestrador multiagente para um ativo/timeframe. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const user = await getSessionFromRequest(req);
  const res = await analyzeAsset({
    symbol: q.symbol,
    timeframe: parseTimeframe(q.timeframe),
    includeSentiment: q.sentiment === "1",
    useLlm: q.llm === "1",
    refresh: q.refresh === "1",
    trigger: "api",
    userId: user?.id ?? null,
  });
  return ok(JSON.parse(JSON.stringify(res, jsonSafe)));
});
