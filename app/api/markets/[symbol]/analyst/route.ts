import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, okPrivate, parseBody, requireUser, withApi } from "@/lib/api";
import { isLlmConfigured } from "@/lib/env";
import { parseTimeframe } from "@/lib/timeframes";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { consumeAiQuota } from "@/services/ai-quota-service";
import { requireEntitlement, requireTimeframe } from "@/services/subscription-service";
import { getMarketContext } from "@/services/market-context-service";
import { analyzeContext } from "@/services/ai-analyst-service";

export const maxDuration = 60;

const bodySchema = z.object({
  tf: z.string().default("4h"),
  exchange: z.enum(VENUES).default("binance"),
  instrument: z.enum(INSTRUMENTS).default("spot"),
  question: z.string().trim().max(300).optional(),
  llm: z.boolean().default(true),
  /** contextKey que o cliente está exibindo; se divergir do calculado, o cliente descarta a resposta */
  contextKey: z.string().max(80).optional(),
});

/** AI Analyst sobre o MESMO contexto do Dashboard. Números só do contexto; LLM opcional com checagem numérica. */
export const POST = withApi(async (req, ctx) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  const { symbol } = await ctx.params;
  const sym = symbolSchema.parse((symbol ?? "").toUpperCase().replace(/USDT$/, ""));
  const body = await parseBody(req, bodySchema);
  const tf = parseTimeframe(body.tf);
  requireTimeframe(access, tf, "analyst");
  const useLlm = body.llm && isLlmConfigured();
  if (useLlm) await enforceRateLimit(req, "llm", `u:${user.id}`);
  const c = await getMarketContext(sym, tf, { exchange: body.exchange, instrument: body.instrument });
  // cota diária do plano: debitada só quando o modelo é chamado; estornada se ele falhar ou não responder
  const ticket = useLlm ? await consumeAiQuota(user.id, access.tier) : null;
  let reply: Awaited<ReturnType<typeof analyzeContext>>;
  try {
    reply = await analyzeContext(c, { question: body.question, useLlm });
  } catch (err) {
    await ticket?.refund();
    throw err;
  }
  if (ticket && reply.guardrail.llm !== "ok" && reply.guardrail.llm !== "rejected") await ticket.refund();
  return okPrivate(reply);
});
