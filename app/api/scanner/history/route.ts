import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ok, parseQuery, requireUser, withApi } from "@/lib/api";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/** Histórico de alertas do usuário (padrões e volume detectados nos scans + alertas disparados). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const q = parseQuery(req, querySchema);
  const prisma = requirePrisma();
  const items = await prisma.scanHistoryEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: q.limit });
  return ok({ items });
});

export const DELETE = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = requirePrisma();
  const { count } = await prisma.scanHistoryEntry.deleteMany({ where: { userId: user.id } });
  return ok({ deleted: count });
});
