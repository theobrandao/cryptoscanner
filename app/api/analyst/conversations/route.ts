import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ok, requireUser, withApi } from "@/lib/api";

/** Conversas recentes do usuário com o Analista IA. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const items = await requirePrisma().analystConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } } });
  return ok({ items: items.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: c._count.messages })) });
});
