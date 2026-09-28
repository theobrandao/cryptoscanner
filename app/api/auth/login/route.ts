import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, parseBody, withApi } from "@/lib/api";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "auth");
  const body = await parseBody(req, bodySchema);
  const prisma = requirePrisma();
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Mesma mensagem para e-mail inexistente e senha errada (não revela cadastro).
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new ApiError(401, "E-mail ou senha inválidos", "invalid_credentials");
  const session = { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role };
  const token = await createSessionToken(session);
  const res = NextResponse.json({ ok: true, data: { user: session } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
