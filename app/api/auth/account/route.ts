import { connection, NextResponse } from "next/server";
import { logAccess } from "@/services/access-log-service";
import { z } from "zod";
import { ApiError, enforceRateLimit, parseBody, requireUser, withApi } from "@/lib/api";
import { SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { requirePrisma } from "@/database/client";

const bodySchema = z.object({
  /** a palavra EXCLUIR, digitada pelo usuário */
  confirm: z.literal("EXCLUIR"),
  password: z.string().min(1).max(128),
});

/**
 * Exclusão de conta e dados (LGPD, art. 18). Remove o usuário e, em cascata, preferências, watchlist,
 * agentes, execuções, logs, alertas, análises e histórico. Chamados de suporte ficam anonimizados
 * (userId = null) para fins de auditoria do atendimento. Irreversível.
 */
export const DELETE = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await enforceRateLimit(req, "auth", `account-delete:${user.id}`);
  const body = await parseBody(req, bodySchema);
  const prisma = requirePrisma();
  const db = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!db || !(await verifyPassword(body.password, db.passwordHash))) throw new ApiError(401, "Senha incorreta", "invalid_credentials");
  await logAccess(req, user.id, "account_deleted");
  await prisma.user.delete({ where: { id: user.id } });
  const res = NextResponse.json({ ok: true, data: { deleted: true } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
