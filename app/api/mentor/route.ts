import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { answerMentor } from "@/services/mentor-service";

/** Mentor: respostas por regras + dados reais (e LLM opcional quando configurado). */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const body = await parseBody(req, z.object({ message: z.string().trim().min(2).max(500) }));
  const user = await getSessionFromRequest(req);
  if (user) await enforceRateLimit(req, "llm", `u:${user.id}`);
  // LLM só para usuário logado; anônimo recebe a resposta por regras + dados reais
  const reply = await answerMentor(body.message, { allowLlm: Boolean(user) });
  return ok(reply);
});
