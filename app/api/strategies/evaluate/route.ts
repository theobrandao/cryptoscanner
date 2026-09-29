import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { definitionSchema } from "@/lib/strategies/definition";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { requireEntitlement } from "@/services/subscription-service";
import { evaluateLive, getStrategy } from "@/services/strategy-service";

export const maxDuration = 60;

const bodySchema = z
  .object({
    id: z.string().optional(),
    definition: definitionSchema.optional(),
    symbol: z.string().trim().toUpperCase().max(12),
    exchange: z.enum(VENUES).default("binance"),
    instrument: z.enum(INSTRUMENTS).default("spot"),
  })
  .refine((b) => b.id || b.definition, "Informe id ou definition");

/** Avalia a estratégia em um ativo agora: resultado de cada condição com o valor observado. */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  await requireEntitlement(user);
  const b = await parseBody(req, bodySchema);
  const def = b.definition ?? (await getStrategy(user.id, b.id as string)).definition;
  return ok(await evaluateLive(def, b.symbol.replace(/USDT$/, ""), b.exchange, b.instrument));
});
