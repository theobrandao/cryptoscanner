import { connection } from "next/server";
import { ApiError, ok, requireUser, withApi } from "@/lib/api";
import { isTelegramConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { createLinkCode, disconnectTelegram } from "@/services/telegram-link";

/** Gera o deep link de conexão com um clique (t.me/<bot>?start=<código>, válido por 15 min). */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  if (!isTelegramConfigured()) throw new ApiError(503, "A conexão com o Telegram está temporariamente indisponível. Os alertas continuam chegando no painel e por push.", "telegram_unavailable");
  const rl = await rateLimit("telegram-link", user.id, 10);
  if (!rl.allowed) throw new ApiError(429, "Muitas tentativas de conexão. Aguarde um minuto e tente de novo.", "rate_limited", { resetAt: rl.resetAt });
  const { url, expiresInSec } = await createLinkCode(user.id);
  return ok({ url, expiresInSec });
});

/** Desconecta o Telegram (remove o Chat ID salvo). */
export const DELETE = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await disconnectTelegram(user.id);
  return ok({ connected: false });
});
