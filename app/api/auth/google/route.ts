import { connection, NextResponse } from "next/server";
import { enforceRateLimit, withApi } from "@/lib/api";
import { isGoogleLoginConfigured } from "@/lib/env";
import { GOOGLE_STATE_COOKIE, safeNext, startGoogleLogin } from "@/services/google-auth-service";

/**
 * GET /api/auth/google?next=/&accept=1 → redireciona ao Google.
 * `accept=1` registra o aceite dos Termos marcado na tela de cadastro (obrigatório para conta nova).
 */
export const GET = withApi(async (req) => {
  await connection();
  const url = new URL(req.url);
  if (!isGoogleLoginConfigured()) return NextResponse.redirect(new URL("/login?erro=google_indisponivel", url.origin));
  await enforceRateLimit(req, "google");
  const start = startGoogleLogin({ next: url.searchParams.get("next"), acceptTerms: url.searchParams.get("accept") === "1" });
  const res = NextResponse.redirect(start.url);
  res.cookies.set(GOOGLE_STATE_COOKIE, start.cookie, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/api/auth/google", maxAge: 600 });
  return res;
});

/** Diz ao formulário se o botão do Google deve aparecer. */
export const POST = withApi(async () => {
  await connection();
  return NextResponse.json({ ok: true, data: { enabled: isGoogleLoginConfigured(), next: safeNext(null) } });
});
