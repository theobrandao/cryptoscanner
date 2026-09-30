import { getEnv, isTelegramConfigured } from "@/lib/env";
import { fetchJson, HttpError } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("telegram");

/**
 * Envio de mensagens via Bot API do Telegram (bot próprio, configurado por TELEGRAM_BOT_TOKEN).
 * O usuário conecta com um clique (deep link /start <código>, ver services/telegram-link.ts) ou
 * informa o Chat ID manualmente — nenhuma integração privada de terceiros é usada.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!isTelegramConfigured()) return { ok: false, error: "TELEGRAM_BOT_TOKEN não configurado" };
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  try {
    await fetchJson(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      retries: 1,
    });
    return { ok: true };
  } catch (err) {
    const error = telegramErrorMessage(err);
    log.warn("falha ao enviar", { error });
    return { ok: false, error };
  }
}

export async function getBotUsername(): Promise<string | null> {
  if (!isTelegramConfigured()) return null;
  try {
    const res = await fetchJson<{ ok: boolean; result?: { username?: string } }>(`https://api.telegram.org/bot${getEnv().TELEGRAM_BOT_TOKEN}/getMe`, { retries: 0 });
    return res.result?.username ?? null;
  } catch {
    return null;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mensagem de erro sem o token do bot (a URL da Bot API o contém e não pode chegar a log nem ao cliente). */
export function telegramErrorMessage(err: unknown): string {
  const msg = err instanceof HttpError ? `HTTP ${err.status}` : err instanceof Error ? err.message : String(err);
  return msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<token>");
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string; username?: string; first_name?: string };
    from?: { id: number; is_bot?: boolean };
  };
}

/** 409 da Bot API: há webhook configurado no bot, então getUpdates não pode ser usado. */
export class TelegramWebhookConflictError extends Error {
  constructor() {
    super("Bot com webhook configurado; getUpdates indisponível");
    this.name = "TelegramWebhookConflictError";
  }
}

/**
 * getUpdates sem long polling (timeout 0). Com `offset`, confirma ao Telegram todas as
 * atualizações com update_id < offset (elas deixam de ser entregues).
 */
export async function getTelegramUpdates(options: { offset?: number; limit?: number } = {}): Promise<TelegramUpdate[]> {
  if (!isTelegramConfigured()) throw new Error("TELEGRAM_BOT_TOKEN não configurado");
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  try {
    const res = await fetchJson<{ ok: boolean; result?: TelegramUpdate[] }>(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeout: 0, allowed_updates: ["message"], limit: options.limit ?? 100, ...(options.offset !== undefined ? { offset: options.offset } : {}) }),
      retries: 0,
      noRetryStatuses: [400, 401, 403, 404, 409, 429],
    });
    return res.result ?? [];
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) throw new TelegramWebhookConflictError();
    throw new Error(telegramErrorMessage(err));
  }
}
