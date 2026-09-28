import { getEnv, isTelegramConfigured } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("telegram");

/**
 * Envio de mensagens via Bot API do Telegram (bot próprio, configurado por TELEGRAM_BOT_TOKEN).
 * O usuário informa o Chat ID manualmente (ex.: via @userinfobot) ou usa /start no bot e
 * cola o ID mostrado — nenhuma integração privada de terceiros é usada.
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
    log.warn("falha ao enviar", { error: (err as Error).message });
    return { ok: false, error: (err as Error).message };
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
