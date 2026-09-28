import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseQuery, requireUser, withApi } from "@/lib/api";

/** Relatórios de sinal do Sentinela (logs de nível "signal"/"info"/"warn"), mais recentes primeiro. Retenção: 30 dias. */
export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const q = parseQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }));
  const prisma = requirePrisma();
  const sentinel = await prisma.agent.findFirst({ where: { id: id ?? "", userId: user.id, kind: "sentinel" } });
  if (!sentinel) throw new ApiError(404, "Sentinela não encontrado", "not_found");
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const items = await prisma.agentLog.findMany({ where: { agentId: sentinel.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: q.limit });
  return ok({ items, sentinel });
});
