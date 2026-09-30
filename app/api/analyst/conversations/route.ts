import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { okPrivate, withApi } from "@/lib/api";
import { requireCoreUser } from "@/services/subscription-service";

/** Conversas recentes do usuário com o Analista IA. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const items = await requirePrisma().analystConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } } });
  return okPrivate({ items: items.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: c._count.messages })) });
});
