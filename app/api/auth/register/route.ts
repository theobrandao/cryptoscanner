import { connection } from "next/server";
import { NextResponse } from "next/server";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, parseBody, withApi } from "@/lib/api";
import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getEnv, isInviteRequired, isOwnerEmail } from "@/lib/env";
import { track } from "@/services/analytics-service";
import { logAccess } from "@/services/access-log-service";
import { sendTemplate } from "@/services/email-service";
import { canRegister } from "@/lib/invite";
import { startTrial } from "@/services/subscription-service";
import { applyPendingGrants } from "@/services/billing/kiwify";
import { registerSchema } from "@/lib/validation/auth";

/** Informa ao formulário se o cadastro exige convite (uso pessoal). */
export const GET = withApi(async () => {
  await connection();
  return NextResponse.json({ ok: true, data: { inviteRequired: isInviteRequired() } });
});

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "register");
  // mensagens em português por campo (mesmas do formulário); aceite dos termos obrigatório
  const body = await parseBody(req, registerSchema);
  // E-mail do dono (OWNER_EMAILS) nunca é cadastrado por senha: o cadastro não prova posse do e-mail e daria ADMIN a quem
  // chegasse primeiro. A conta do dono nasce pelo login com Google (e-mail verificado).
  if (isOwnerEmail(body.email)) throw new ApiError(403, "Para esta conta, entre com o Google.", "owner_use_google");
  if (!canRegister(body.email, body.invite)) throw new ApiError(403, "Cadastro restrito ao dono da conta (uso pessoal)", "invite_required");
  const prisma = requirePrisma();
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new ApiError(409, "E-mail já cadastrado", "email_taken");
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      termsVersion: getEnv().LEGAL_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      preference: { create: {} },
      watchlists: { create: { name: "Favoritos", isDefault: true } },
    },
  });
  // teste grátis do PRO
  await startTrial(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { plan: "PRO" } });
  await track("trial_started", { userId: user.id });
  // compra feita na Kiwify antes do cadastro (mesmo e-mail) substitui o teste
  // TODO segurança: aplicar compra pendente só com e-mail confirmado quando o envio de e-mail estiver ativo
  await applyPendingGrants(user.id, user.email);
  await track("signup", { userId: user.id, props: { owner: false } });
  await logAccess(req, user.id, "register");
  void sendTemplate("welcome", { to: user.email, name: user.name }).catch(() => undefined);
  const session = { id: user.id, email: user.email, name: user.name, plan: "PRO" as const, role: user.role };
  const token = await createSessionToken(session);
  const res = NextResponse.json({ ok: true, data: { user: session } }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
