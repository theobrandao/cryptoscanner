import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { requireEntitlement } from "@/services/subscription-service";
import { deleteMonitor, MONITOR_STATES, updateMonitor } from "@/services/monitor-service";

const patchSchema = z.object({
  active: z.boolean().optional(),
  states: z.array(z.enum(MONITOR_STATES)).max(7).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  notifyPush: z.boolean().optional(),
  notifyTelegram: z.boolean().optional(),
});

export const PATCH = withApi(async (req, ctx) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  await requireEntitlement(user);
  const { id } = await ctx.params;
  return ok({ monitor: await updateMonitor(user.id, id as string, await parseBody(req, patchSchema)) });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await deleteMonitor(user.id, id as string);
  return ok({ deleted: true });
});
