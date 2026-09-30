import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, NO_STORE, ok, parseQuery, withApi } from "@/lib/api";
import { parseTimeframe } from "@/lib/timeframes";
import { analyzeAsset, jsonSafe } from "@/services/analysis-service";
import { requireCoreUser, requireTimeframe } from "@/services/subscription-service";

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
  const user = await requireCoreUser(req);
  const tf = parseTimeframe(q.timeframe);
  requireTimeframe(user.access, tf, "analysis");
  // LLM e coleta forçada (custo externo) no balde de LLM do usuário
  const useLlm = q.llm === "1";
  if (useLlm || q.refresh === "1") await enforceRateLimit(req, "llm", `u:${user.id}`);
  const res = await analyzeAsset({
    symbol: q.symbol,
    timeframe: tf,
    includeSentiment: q.sentiment === "1",
    useLlm,
    refresh: q.refresh === "1",
    trigger: "api",
    userId: user.id,
  });
  return ok(JSON.parse(JSON.stringify(res, jsonSafe)), { headers: NO_STORE });
});
