import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, okPrivate, parseBody, requireUser, withApi } from "@/lib/api";
import { requirePrisma } from "@/database/client";
import { requireEntitlement, requireTimeframe } from "@/services/subscription-service";
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
  const access = await requireEntitlement(user);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  // reativar monitor criado em tempo gráfico que o plano atual não cobre (ex.: 1H depois de sair do ELITE)
  if (body.active) {
    const current = await requirePrisma().monitor.findFirst({ where: { id: id as string, userId: user.id }, select: { timeframe: true } });
    if (current) requireTimeframe(access, current.timeframe, "monitors");
  }
  return okPrivate({ monitor: await updateMonitor(user.id, id as string, body) });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await deleteMonitor(user.id, id as string);
  return okPrivate({ deleted: true });
});
