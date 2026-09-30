import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { isLlmConfigured } from "@/lib/env";
import { answerMentor } from "@/services/mentor-service";
import { requireCoreUser } from "@/services/subscription-service";

/** Mentor: respostas por regras + dados reais (e LLM opcional quando configurado). */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const body = await parseBody(req, z.object({ message: z.string().trim().min(2).max(500) }));
  const user = await requireCoreUser(req);
  // limite de custo só quando a resposta pode usar o modelo de linguagem
  if (isLlmConfigured()) await enforceRateLimit(req, "llm", `u:${user.id}`);
  const reply = await answerMentor(body.message, { allowLlm: true });
  return ok(reply);
});
