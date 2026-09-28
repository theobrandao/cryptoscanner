import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { PLANS } from "@/lib/plans";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "STOPPED"]).optional(),
  minConfidence: z.number().int().min(50).max(95).optional(),
  notification: z.enum(["log", "telegram", "both"]).optional(),
});

async function own(userId: string, id: string) {
  const agent = await requirePrisma().agent.findFirst({ where: { id, userId, kind: "sentinel" } });
  if (!agent) throw new ApiError(404, "Sentinela não encontrado", "not_found");
  return agent;
}

export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const sentinel = await own(user.id, id ?? "");
  return ok({ sentinel });
});

export const PATCH = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const sentinel = await own(user.id, id ?? "");
  const body = await parseBody(req, patchSchema);
  if (body.notification && body.notification !== "log" && !PLANS[user.plan].telegramAlerts) throw new ApiError(403, "Alertas no Telegram exigem plano PRO ou PLATINUM", "plan_required");
  const updated = await requirePrisma().agent.update({ where: { id: sentinel.id }, data: body });
  return ok({ sentinel: updated });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const sentinel = await own(user.id, id ?? "");
  await requirePrisma().agent.delete({ where: { id: sentinel.id } });
  return ok({ deleted: true });
});
