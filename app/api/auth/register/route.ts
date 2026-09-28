import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, parseBody, withApi } from "@/lib/api";
import { createSessionToken, hashPassword, passwordPolicy, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: passwordPolicy,
});

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "auth");
  const body = await parseBody(req, bodySchema);
  const prisma = requirePrisma();
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new ApiError(409, "E-mail já cadastrado", "email_taken");
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password), preference: { create: {} }, watchlists: { create: { name: "Favoritos", isDefault: true } } },
  });
  const session = { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role };
  const token = await createSessionToken(session);
  const res = NextResponse.json({ ok: true, data: { user: session } }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
