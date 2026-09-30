import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { definitionSchema } from "@/lib/strategies/definition";
import { requireEntitlement, requireStrategyTimeframes } from "@/services/subscription-service";
import { deleteStrategy, getStrategy, updateStrategy } from "@/services/strategy-service";

export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  await requireEntitlement(user);
  const { id } = await ctx.params;
  return ok({ strategy: await getStrategy(user.id, id as string) });
});

const patchSchema = z.object({ name: z.string().trim().min(2).max(60).optional(), description: z.string().trim().max(300).nullable().optional(), definition: definitionSchema.optional() });

export const PATCH = withApi(async (req, ctx) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (body.definition) requireStrategyTimeframes(access, body.definition, "strategies");
  return ok({ strategy: await updateStrategy(user.id, id as string, body) });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  await requireEntitlement(user);
  const { id } = await ctx.params;
  await deleteStrategy(user.id, id as string);
  return ok({ deleted: true });
});
