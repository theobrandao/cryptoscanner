import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { parseTimeframe } from "@/lib/timeframes";
import { analyzeAsset, jsonSafe } from "@/services/analysis-service";
import { requireCoreUser } from "@/services/subscription-service";

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
  // LLM e coleta forçada (custo externo) só para usuário logado, no balde de LLM
  const useLlm = q.llm === "1" && Boolean(user);
  if (useLlm || q.refresh === "1") await enforceRateLimit(req, "llm", user ? `u:${user.id}` : undefined);
  const res = await analyzeAsset({
    symbol: q.symbol,
    timeframe: parseTimeframe(q.timeframe),
    includeSentiment: q.sentiment === "1",
    useLlm,
    refresh: q.refresh === "1" && Boolean(user),
    trigger: "api",
    userId: user?.id ?? null,
  });
  return ok(JSON.parse(JSON.stringify(res, jsonSafe)));
});
