import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { answerMentor } from "@/services/mentor-service";

/** Mentor: respostas por regras + dados reais (e LLM opcional quando configurado). */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const body = await parseBody(req, z.object({ message: z.string().trim().min(2).max(500) }));
  const reply = await answerMentor(body.message);
  return ok(reply);
});
