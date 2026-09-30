import { connection, NextResponse } from "next/server";
import { ApiError, enforceRateLimit, withApi } from "@/lib/api";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logAccess } from "@/services/access-log-service";
import { exchangeCode, GOOGLE_STATE_COOKIE, safeNext, signInWithGoogle } from "@/services/google-auth-service";

const log = createLogger("google-auth");

function readStateCookie(req: Request): { state: string; verifier: string; next: string; accept: boolean } | null {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GOOGLE_STATE_COOKIE}=`));
  if (!match) return null;
  try {
    const v = JSON.parse(decodeURIComponent(match.slice(GOOGLE_STATE_COOKIE.length + 1))) as { state?: string; verifier?: string; next?: string; accept?: boolean };
    if (!v.state || !v.verifier) return null;
    return { state: v.state, verifier: v.verifier, next: safeNext(v.next), accept: v.accept === true };
  } catch {
    return null;
  }
}

/** Retorno do Google: confere state, troca o código, entra/cria a conta e grava o cookie de sessão. */
export const GET = withApi(async (req) => {
  await connection();
  const url = new URL(req.url);
  const saved = readStateCookie(req);
  const clear = (res: NextResponse) => {
    res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
    return res;
  };
  const fail = (code: string, page: "login" | "registro" = "login") => clear(NextResponse.redirect(new URL(`/${page}?erro=${code}${saved?.next ? `&next=${encodeURIComponent(saved.next)}` : ""}`, url.origin)));
  try {
    await enforceRateLimit(req, "google_callback");
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return fail("google_falhou");
    throw err;
  }
  if (url.searchParams.get("error")) return fail("google_cancelado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!saved || !code || !state || state !== saved.state) {
    log.warn("callback sem state válido");
    return fail("google_estado");
  }
  try {
    const identity = await exchangeCode(code, saved.verifier);
    const r = await signInWithGoogle(identity, { acceptTerms: saved.accept });
    const token = await createSessionToken(r.user);
    await logAccess(req, r.user.id, r.created ? "register" : "login");
    const res = clear(NextResponse.redirect(new URL(saved.next, url.origin)));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "terms_required") return fail("google_termos", "registro");
      if (err.code === "account_blocked") return fail("conta_bloqueada");
      if (err.code === "invite_required") return fail("cadastro_restrito", "registro");
      return fail("google_falhou");
    }
    throw err;
  }
});
