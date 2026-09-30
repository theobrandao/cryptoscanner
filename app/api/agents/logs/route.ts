import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ok, parseQuery, withApi } from "@/lib/api";
import { requireCoreUser } from "@/services/subscription-service";

/** Log de operações de todos os agentes do usuário (painel "ao vivo"). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const q = parseQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(60), since: z.coerce.number().optional() }));
  const prisma = requirePrisma();
  // ids dos agentes do usuário primeiro: `agentId IN (...)` usa o índice (agentId, createdAt) em vez de juntar com Agent
  const agentIds = (await prisma.agent.findMany({ where: { userId: user.id }, select: { id: true } })).map((a) => a.id);
  if (!agentIds.length) return ok({ items: [] });
  const items = await prisma.agentLog.findMany({
    where: { agentId: { in: agentIds }, ...(q.since ? { createdAt: { gt: new Date(q.since) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: { agent: { select: { id: true, name: true, icon: true } } },
  });
  return ok({ items });
});
