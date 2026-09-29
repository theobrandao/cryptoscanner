import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { definitionSchema } from "@/lib/strategies/definition";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { requireEntitlement } from "@/services/subscription-service";
import { getStrategy, scanStrategy } from "@/services/strategy-service";

export const maxDuration = 60;

const bodySchema = z
  .object({ id: z.string().optional(), definition: definitionSchema.optional(), exchange: z.enum(VENUES).default("binance"), instrument: z.enum(INSTRUMENTS).default("spot") })
  .refine((b) => b.id || b.definition, "Informe id ou definition");

/** Roda a estratégia no universo de 30 ativos (cache 60 s). */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  await requireEntitlement(user);
  // varredura do universo é cara: 5 por minuto por usuário (cache de 60 s por definição)
  await enforceRateLimit(req, "llm", `scan:${user.id}`);
  const b = await parseBody(req, bodySchema);
  const def = b.definition ?? (await getStrategy(user.id, b.id as string)).definition;
  return ok(await scanStrategy(def, b.exchange, b.instrument));
});
