import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, requireUser, withApi } from "@/lib/api";

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const prisma = requirePrisma();
  const alert = await prisma.alert.findFirst({ where: { id, userId: user.id } });
  if (!alert) throw new ApiError(404, "Alerta não encontrado", "not_found");
  await prisma.alert.delete({ where: { id: alert.id } });
  return ok({ deleted: true });
});

export const PATCH = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ active: z.boolean() }));
  const prisma = requirePrisma();
  const alert = await prisma.alert.findFirst({ where: { id, userId: user.id } });
  if (!alert) throw new ApiError(404, "Alerta não encontrado", "not_found");
  const updated = await prisma.alert.update({ where: { id: alert.id }, data: { active: body.active, triggeredAt: body.active ? null : alert.triggeredAt } });
  return ok({ alert: updated });
});
