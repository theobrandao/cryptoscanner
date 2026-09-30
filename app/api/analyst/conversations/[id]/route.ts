import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, withApi } from "@/lib/api";
import { requireCoreUser } from "@/services/subscription-service";

/** Mensagens de uma conversa (só do dono). */
export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireCoreUser(req);
  const { id } = await ctx.params;
  const prisma = requirePrisma();
  const conv = await prisma.analystConversation.findFirst({ where: { id, userId: user.id }, select: { id: true, title: true } });
  if (!conv) throw new ApiError(404, "Conversa não encontrada", "not_found");
  const messages = await prisma.analystMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, meta: true, createdAt: true } });
  return ok({ ...conv, messages });
});

/** Apaga uma conversa (só do dono). */
export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireCoreUser(req);
  const { id } = await ctx.params;
  const r = await requirePrisma().analystConversation.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new ApiError(404, "Conversa não encontrada", "not_found");
  return ok({ deleted: true });
});
