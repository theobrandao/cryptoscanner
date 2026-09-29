import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, parseBody, withApi } from "@/lib/api";
import { createSessionToken, hashPassword, passwordPolicy, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getEnv, isInviteRequired, isOwnerEmail } from "@/lib/env";
import { track } from "@/services/analytics-service";
import { logAccess } from "@/services/access-log-service";
import { sendTemplate } from "@/services/email-service";
import { canRegister } from "@/lib/invite";
import { startTrial } from "@/services/subscription-service";
import { applyPendingGrants } from "@/services/billing/kiwify";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: passwordPolicy,
  invite: z.string().trim().max(200).optional(),
  /** aceite explícito dos Termos, Privacidade e Reembolso (versão vigente gravada no usuário) */
  acceptTerms: z.literal(true, { message: "É preciso aceitar os Termos de Uso e a Política de Privacidade" }),
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
  if (!canRegister(body.email, body.invite)) throw new ApiError(403, "Cadastro restrito ao dono da conta (uso pessoal)", "invite_required");
  const prisma = requirePrisma();
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new ApiError(409, "E-mail já cadastrado", "email_taken");
  const owner = isOwnerEmail(body.email);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      termsVersion: getEnv().LEGAL_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      ...(owner ? { plan: "PLATINUM" as const, role: "ADMIN" as const } : {}),
      preference: { create: {} },
      watchlists: { create: { name: "Favoritos", isDefault: true } },
    },
  });
  // teste grátis do PRO (dono/admin não precisa)
  if (!owner) {
    await startTrial(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { plan: "PRO" } });
    await track("trial_started", { userId: user.id });
  }
  // compra feita na Kiwify antes do cadastro (mesmo e-mail) substitui o teste
  await applyPendingGrants(user.id, user.email);
  await track("signup", { userId: user.id, props: { owner } });
  await logAccess(req, user.id, "register");
  void sendTemplate("welcome", { to: user.email, name: user.name }).catch(() => undefined);
  const session = { id: user.id, email: user.email, name: user.name, plan: owner ? user.plan : ("PRO" as const), role: user.role };
  const token = await createSessionToken(session);
  const res = NextResponse.json({ ok: true, data: { user: session } }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
