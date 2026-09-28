import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseQuery, requireUser, withApi } from "@/lib/api";

export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const q = parseQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }));
  const prisma = requirePrisma();
  const agent = await prisma.agent.findFirst({ where: { id: id ?? "", userId: user.id } });
  if (!agent) throw new ApiError(404, "Agente não encontrado", "not_found");
  const items = await prisma.agentLog.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: "desc" }, take: q.limit });
  return ok({ items });
});
