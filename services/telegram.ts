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

/** 409 transitório: outra leitura de getUpdates em andamento ("terminated by other getUpdates request"). Tentar de novo. */
export class TelegramBusyError extends Error {
  constructor() {
    super("getUpdates em uso por outra verificação");
    this.name = "TelegramBusyError";
  }
}

/**
 * getUpdates sem long polling (timeout 0). Com `offset`, confirma ao Telegram todas as
 * atualizações com update_id < offset (elas deixam de ser entregues).
 */
export async function getTelegramUpdates(options: { offset?: number; limit?: number } = {}): Promise<TelegramUpdate[]> {
  if (!isTelegramConfigured()) throw new Error("TELEGRAM_BOT_TOKEN não configurado");
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  let res: Response;
  try {
    // fetch direto (sem fetchJson) para ler a descrição do erro: o 409 tem duas causas diferentes
    res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ timeout: 0, allowed_updates: ["message"], limit: options.limit ?? 100, ...(options.offset !== undefined ? { offset: options.offset } : {}) }),
      signal: AbortSignal.timeout(getEnv().HTTP_TIMEOUT_MS),
      redirect: "manual",
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(telegramErrorMessage(err));
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: TelegramUpdate[]; description?: string } | null;
  if (res.status === 409) {
    // "can't use getUpdates method while webhook is active" → permanente; "terminated by other getUpdates request" → transitório
    if (/webhook/i.test(body?.description ?? "")) throw new TelegramWebhookConflictError();
    throw new TelegramBusyError();
  }
  if (!res.ok || !body) throw new Error(telegramErrorMessage(new HttpError(res.status, "getUpdates")));
  return body.result ?? [];
}
