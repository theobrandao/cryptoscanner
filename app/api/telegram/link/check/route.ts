import { connection } from "next/server";
import { ApiError, ok, requireUser, withApi } from "@/lib/api";
import { isTelegramConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { TelegramBusyError, TelegramWebhookConflictError } from "@/services/telegram";
import { checkLink } from "@/services/telegram-link";

/** Verifica se o usuário já tocou em "Iniciar" no bot; em caso positivo, salva o Chat ID. */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  if (!isTelegramConfigured()) throw new ApiError(503, "A conexão com o Telegram está temporariamente indisponível. Os alertas continuam chegando no painel e por push.", "telegram_unavailable");
  const rl = await rateLimit("telegram-link-check", user.id, 40);
  if (!rl.allowed) throw new ApiError(429, "Muitas verificações seguidas. Aguarde alguns segundos.", "rate_limited", { resetAt: rl.resetAt });
  try {
    return ok(await checkLink(user.id));
  } catch (err) {
    if (err instanceof TelegramWebhookConflictError) throw new ApiError(503, "Conexão automática indisponível; use a conexão manual.", "telegram_webhook_set");
    if (err instanceof TelegramBusyError) throw new ApiError(503, "Tente de novo em alguns segundos.", "telegram_busy");
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, "Não foi possível consultar o Telegram agora. Tente de novo em instantes.", "telegram_failed");
  }
});
