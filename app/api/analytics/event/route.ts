import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { track } from "@/services/analytics-service";

/** Eventos de produto emitidos pelo cliente — somente nomes da lista, propriedades técnicas curtas. */
const CLIENT_EVENTS = ["dashboard_view", "context_change", "analyst_open", "plans_view", "onboarding_step", "strategy_scan"] as const;
const bodySchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  anonId: z.string().max(40).optional(),
  props: z.record(z.string().max(30), z.union([z.string().max(60), z.number(), z.boolean(), z.null()])).optional(),
});

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const b = await parseBody(req, bodySchema);
  const user = await getSessionFromRequest(req);
  const props = b.props && Object.keys(b.props).length <= 8 ? b.props : undefined;
  await track(b.name, { userId: user?.id ?? null, anonId: user ? null : (b.anonId ?? null), props });
  return ok({ tracked: true });
});
