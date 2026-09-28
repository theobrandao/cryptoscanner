import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ok, parseQuery, requireUser, withApi } from "@/lib/api";

/** Log de operações de todos os agentes do usuário (painel "ao vivo"). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const q = parseQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(60), since: z.coerce.number().optional() }));
  const items = await requirePrisma().agentLog.findMany({
    where: { agent: { userId: user.id }, ...(q.since ? { createdAt: { gt: new Date(q.since) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: { agent: { select: { id: true, name: true, icon: true } } },
  });
  return ok({ items });
});
