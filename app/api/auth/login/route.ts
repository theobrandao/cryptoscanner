import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, BLOCKED_MESSAGE, enforceRateLimit, parseBody, withApi } from "@/lib/api";
import { shouldPromoteOwner } from "@/lib/owner-promotion";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { logAccess } from "@/services/access-log-service";
import { applyPendingGrants } from "@/services/billing/kiwify";
import { track } from "@/services/analytics-service";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "auth");
  const body = await parseBody(req, bodySchema);
  const prisma = requirePrisma();
  let user = await prisma.user.findUnique({ where: { email: body.email } });
  // Mesma mensagem para e-mail inexistente e senha errada (não revela cadastro).
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new ApiError(401, "E-mail ou senha inválidos", "invalid_credentials");
  // conta bloqueada pelo administrador (só depois da senha conferida: não revela o bloqueio a terceiros)
  if (user.blockedAt) throw new ApiError(403, BLOCKED_MESSAGE, "account_blocked");
  // Dono (OWNER_EMAILS): por senha só promove contas criadas antes do corte (ver lib/owner-promotion.ts); as demais só pelo Google.
  if (shouldPromoteOwner({ email: user.email, via: "password", emailVerified: false, createdAt: user.createdAt }) && (user.plan !== "PLATINUM" || user.role !== "ADMIN")) {
    user = await prisma.user.update({ where: { id: user.id }, data: { plan: "PLATINUM", role: "ADMIN" } });
  }
  // compra na Kiwify ainda não aplicada a esta conta (mesmo e-mail)
  if (await applyPendingGrants(user.id, user.email)) user = (await prisma.user.findUnique({ where: { id: user.id } })) ?? user;
  const session = { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role };
  const token = await createSessionToken(session);
  await logAccess(req, user.id, "login");
  await track("login", { userId: user.id });
  const res = NextResponse.json({ ok: true, data: { user: session } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
