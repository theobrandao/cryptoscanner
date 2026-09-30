import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { definitionSchema, FEATURES, OPS, STRATEGY_TEMPLATES, STRATEGY_TFS } from "@/lib/strategies/definition";
import { requireEntitlement, requireStrategyTimeframes } from "@/services/subscription-service";
import { createStrategy, listStrategies } from "@/services/strategy-service";
import { track } from "@/services/analytics-service";

/** Estratégias do usuário + catálogo (features, operadores, timeframes, modelos) e limite do plano. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  return ok({ items: await listStrategies(user.id), limit: access.entitlements.maxStrategies, catalog: { features: FEATURES, ops: OPS, timeframes: STRATEGY_TFS }, templates: STRATEGY_TEMPLATES });
});

const bodySchema = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(300).optional(), definition: definitionSchema });

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  const body = await parseBody(req, bodySchema);
  requireStrategyTimeframes(access, body.definition, "strategies");
  const s = await createStrategy(user.id, access, body);
  await track("strategy_created", { userId: user.id, props: { conditions: body.definition.groups.reduce((a, g) => a + g.conditions.length, 0) } });
  return ok({ strategy: s }, { status: 201 });
});
