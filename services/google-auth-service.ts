import { createHash, randomBytes } from "node:crypto";
import { requirePrisma } from "@/database/client";
import { ApiError, BLOCKED_MESSAGE } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { getEnv, isGoogleLoginConfigured } from "@/lib/env";
import { canRegister } from "@/lib/invite";
import { shouldPromoteOwner } from "@/lib/owner-promotion";
import { createLogger } from "@/lib/logger";
import { track } from "@/services/analytics-service";
import { applyPendingGrants } from "@/services/billing/kiwify";
import { sendTemplate } from "@/services/email-service";
import { startTrial } from "@/services/subscription-service";

/**
 * Entrar/cadastrar com Google — OAuth 2.0 "authorization code" com PKCE e state (CSRF), sem biblioteca externa.
 *  - Só e-mail verificado pelo Google (email_verified) vira conta.
 *  - Conta existente com o mesmo e-mail é vinculada (googleSub) e entra normalmente. Se ela nasceu por senha (sem googleSub),
 *    a senha é trocada por uma aleatória e as sessões abertas caem: o cadastro por senha não prova posse do e-mail, e quem
 *    cadastrou o e-mail de outra pessoa perde o acesso quando o dono verdadeiro entra pelo Google.
 *  - Dono (OWNER_EMAILS) vira ADMIN só com e-mail verificado pelo Google (lib/owner-promotion.ts).
 *  - Conta nova exige o aceite dos Termos na tela de cadastro (flag no state) e respeita canRegister().
 * Docs: developers.google.com/identity/protocols/oauth2/web-server · openid-connect
 */
const log = createLogger("google-auth");
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_BASE = "https://oauth2.googleapis.com";

/** Base dos endpoints de token. Um simulador (GOOGLE_OAUTH_BASE_TEST) só é aceito quando o app roda em localhost. */
function oauthBase(): string {
  const test = process.env.GOOGLE_OAUTH_BASE_TEST;
  return test && /^http:\/\/localhost(:\d+)?\/?$/.test(getEnv().NEXT_PUBLIC_APP_URL) ? test.replace(/\/$/, "") : GOOGLE_OAUTH_BASE;
}

export const GOOGLE_STATE_COOKIE = "cs_google_oauth";

export interface OAuthStart {
  url: string;
  /** conteúdo do cookie de estado (state + verifier + destino + aceite) */
  cookie: string;
}

export function redirectUri(): string {
  return `${getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Só caminhos internos ("/x"); "//host" e "/\\host" não (open redirect). */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}

export function startGoogleLogin(opts: { next?: string | null; acceptTerms: boolean }): OAuthStart {
  if (!isGoogleLoginConfigured()) throw new ApiError(503, "Login com Google não configurado", "google_disabled");
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    client_id: getEnv().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const cookie = JSON.stringify({ state, verifier, next: safeNext(opts.next), accept: opts.acceptTerms });
  return { url: `${AUTH_URL}?${params.toString()}`, cookie };
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  /** claim email_verified do Google (exchangeCode só devolve identidades verificadas) */
  emailVerified: boolean;
}

/** Troca o código pelo token e confere o id_token no endpoint tokeninfo do Google (assinatura, aud, iss, e-mail verificado). */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleIdentity> {
  const env = getEnv();
  const res = await fetch(`${oauthBase()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  const tok = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tok.id_token) {
    log.warn("troca do código falhou", { status: res.status, error: tok.error });
    throw new ApiError(401, "Não foi possível concluir o login com Google", "google_exchange_failed");
  }
  const info = await fetch(`${oauthBase()}/tokeninfo?id_token=${encodeURIComponent(tok.id_token)}`, { signal: AbortSignal.timeout(15_000) });
  const claims = (await info.json().catch(() => ({}))) as { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; given_name?: string; exp?: string };
  const verified = claims.email_verified === true || claims.email_verified === "true";
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!info.ok || claims.aud !== env.GOOGLE_CLIENT_ID || !issOk || !claims.sub || !claims.email || !verified) {
    log.warn("id_token recusado", { ok: info.ok, audOk: claims.aud === env.GOOGLE_CLIENT_ID, issOk, verified });
    throw new ApiError(401, "Conta Google sem e-mail verificado ou token inválido", "google_token_invalid");
  }
  const email = claims.email.trim().toLowerCase();
  const local = email.split("@")[0] ?? "usuario";
  return { sub: claims.sub, email, name: (claims.name ?? claims.given_name ?? local).trim().slice(0, 80) || local, emailVerified: verified };
}

export interface GoogleSignInResult {
  user: { id: string; email: string; name: string; plan: "FREE" | "PRO" | "PLATINUM"; role: "USER" | "ADMIN" };
  created: boolean;
}

export interface GoogleLinkChanges {
  googleSub?: string;
  plan?: "PLATINUM";
  role?: "ADMIN";
  /** conta criada por senha e vinculada agora: senha aleatória + passwordChangedAt (derruba sessões de quem a cadastrou) */
  resetPassword: boolean;
}

/** Decide o que muda numa conta existente ao entrar com Google (vínculo, troca de senha e promoção do dono). */
export function googleLinkChanges(user: { googleSub: string | null; email: string; plan: string; role: string; createdAt: Date }, identity: GoogleIdentity): GoogleLinkChanges {
  const out: GoogleLinkChanges = { resetPassword: false };
  if (identity.emailVerified && user.googleSub !== identity.sub) {
    out.googleSub = identity.sub;
    out.resetPassword = user.googleSub == null;
  }
  if (shouldPromoteOwner({ email: identity.email, via: "google", emailVerified: identity.emailVerified, createdAt: user.createdAt }) && user.email.toLowerCase() === identity.email.toLowerCase() && (user.plan !== "PLATINUM" || user.role !== "ADMIN")) {
    out.plan = "PLATINUM";
    out.role = "ADMIN";
  }
  return out;
}

/**
 * Entra com a identidade Google: vincula a conta existente (mesmo e-mail) ou cria uma nova.
 * Conta nova sem aceite dos Termos → erro "terms_required" (a tela de cadastro pede o aceite e repete o fluxo).
 */
export async function signInWithGoogle(identity: GoogleIdentity, opts: { acceptTerms: boolean }): Promise<GoogleSignInResult> {
  const prisma = requirePrisma();
  const env = getEnv();
  if (!identity.emailVerified) throw new ApiError(401, "Conta Google sem e-mail verificado ou token inválido", "google_token_invalid");
  let user = await prisma.user.findFirst({ where: { OR: [{ googleSub: identity.sub }, { email: identity.email }] } });
  const owner = shouldPromoteOwner({ email: identity.email, via: "google", emailVerified: identity.emailVerified, createdAt: new Date() });
  if (user) {
    if (user.blockedAt) throw new ApiError(403, BLOCKED_MESSAGE, "account_blocked");
    const { resetPassword, ...changes } = googleLinkChanges(user, identity);
    const data: { googleSub?: string; plan?: "PLATINUM"; role?: "ADMIN"; passwordHash?: string; passwordChangedAt?: Date } = { ...changes };
    if (resetPassword) {
      // mesma senha aleatória das contas novas pelo Google; "Esqueci minha senha" cria outra se o dono quiser
      data.passwordHash = await hashPassword(b64url(randomBytes(32)));
      data.passwordChangedAt = new Date();
    }
    if (Object.keys(data).length) user = await prisma.user.update({ where: { id: user.id }, data });
    if (await applyPendingGrants(user.id, user.email)) user = (await prisma.user.findUnique({ where: { id: user.id } })) ?? user;
    await track("login", { userId: user.id, props: { provider: "google" } });
    return { user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role }, created: false };
  }
  if (!opts.acceptTerms) throw new ApiError(403, "Aceite os Termos de Uso para criar a conta", "terms_required");
  if (!canRegister(identity.email, undefined)) throw new ApiError(403, "Cadastro restrito nesta fase", "invite_required");
  // senha aleatória (a conta entra pelo Google; "Esqueci minha senha" cria uma senha se o usuário quiser)
  const created = await prisma.user.create({
    data: {
      name: identity.name || (identity.email.split("@")[0] ?? "Usuário"),
      email: identity.email,
      passwordHash: await hashPassword(b64url(randomBytes(32))),
      googleSub: identity.sub,
      termsVersion: env.LEGAL_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      ...(owner ? { plan: "PLATINUM" as const, role: "ADMIN" as const } : {}),
      preference: { create: {} },
      watchlists: { create: { name: "Favoritos", isDefault: true } },
    },
  });
  let plan: "FREE" | "PRO" | "PLATINUM" = created.plan;
  if (!owner) {
    await startTrial(created.id);
    await prisma.user.update({ where: { id: created.id }, data: { plan: "PRO" } });
    plan = "PRO";
    await track("trial_started", { userId: created.id });
  }
  await applyPendingGrants(created.id, created.email);
  const fresh = await prisma.user.findUnique({ where: { id: created.id }, select: { plan: true, role: true } });
  await track("signup", { userId: created.id, props: { owner, provider: "google" } });
  void sendTemplate("welcome", { to: created.email, name: created.name }).catch(() => undefined);
  return { user: { id: created.id, email: created.email, name: created.name, plan: fresh?.plan ?? plan, role: fresh?.role ?? created.role }, created: true };
}
