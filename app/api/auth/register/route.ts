import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, parseBody, withApi } from "@/lib/api";
import { createSessionToken, hashPassword, passwordPolicy, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { isInviteRequired, isOwnerEmail } from "@/lib/env";
import { checkInvite } from "@/lib/invite";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: passwordPolicy,
  invite: z.string().trim().max(200).optional(),
});

/** Informa ao formulário se o cadastro exige convite (uso pessoal). */
export const GET = withApi(async () => {
  await connection();
  return NextResponse.json({ ok: true, data: { inviteRequired: isInviteRequired() } });
});

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "auth");
  const body = await parseBody(req, bodySchema);
  if (!checkInvite(body.invite)) throw new ApiError(403, "Cadastro restrito: código de convite inválido", "invite_required");
  const prisma = requirePrisma();
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new ApiError(409, "E-mail já cadastrado", "email_taken");
  const owner = isOwnerEmail(body.email);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      ...(owner ? { plan: "PLATINUM" as const, role: "ADMIN" as const } : {}),
      preference: { create: {} },
      watchlists: { create: { name: "Favoritos", isDefault: true } },
    },
  });
  const session = { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role };
  const token = await createSessionToken(session);
  const res = NextResponse.json({ ok: true, data: { user: session } }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
