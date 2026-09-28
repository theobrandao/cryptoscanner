import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, requireUser, withApi } from "@/lib/api";

export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const sim = await requirePrisma().simulation.findFirst({ where: { id: id ?? "", userId: user.id } });
  if (!sim) throw new ApiError(404, "Simulação não encontrada", "not_found");
  return ok({ simulation: sim });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const sim = await requirePrisma().simulation.findFirst({ where: { id: id ?? "", userId: user.id } });
  if (!sim) throw new ApiError(404, "Simulação não encontrada", "not_found");
  await requirePrisma().simulation.delete({ where: { id: sim.id } });
  return ok({ deleted: true });
});
