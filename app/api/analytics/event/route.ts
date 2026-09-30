import { connection } from "next/server";
import { z } from "zod";
import { ApiError, enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { CLIENT_ANALYTICS_EVENTS, sanitizeClientProps, track } from "@/services/analytics-service";

/** Eventos de produto emitidos pelo cliente — somente nomes da lista (ver services/analytics-service.ts), propriedades curtas. */
const bodySchema = z.object({
  name: z.enum(CLIENT_ANALYTICS_EVENTS),
  anonId: z.string().max(40).optional(),
  props: z.record(z.string().max(30), z.union([z.string().max(60), z.number(), z.boolean(), z.null()])).optional(),
});

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const b = await parseBody(req, bodySchema);
  const clean = sanitizeClientProps(b.name, b.props);
  if (!clean.ok) throw new ApiError(400, "Evento inválido", "validation");
  const user = await getSessionFromRequest(req);
  await track(b.name, { userId: user?.id ?? null, anonId: user ? null : (b.anonId ?? null), props: clean.props });
  return ok({ tracked: true });
});
