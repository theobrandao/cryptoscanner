import { connection } from "next/server";
import { getPrisma } from "@/database/client";
import { ok, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

/** Sessão atual + plano (relido do banco quando disponível para refletir mudanças de plano). */
export const GET = withApi(async (req) => {
  await connection();
  const session = await getSessionFromRequest(req);
  if (!session) return ok({ user: null });
  const prisma = getPrisma();
  let user = session;
  let telegramChatId: string | null = null;
  if (prisma) {
    const db = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, email: true, name: true, plan: true, role: true, telegramChatId: true } });
    if (!db) return ok({ user: null });
    user = { id: db.id, email: db.email, name: db.name, plan: db.plan, role: db.role };
    telegramChatId = db.telegramChatId;
  }
  return ok({ user, plan: PLANS[user.plan], telegramConnected: Boolean(telegramChatId) });
});
