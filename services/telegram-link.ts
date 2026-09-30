import { randomBytes } from "node:crypto";
import { requirePrisma } from "@/database/client";
import { getCache } from "@/lib/cache";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { getTelegramUpdates, sendTelegramMessage, type TelegramUpdate } from "@/services/telegram";

const log = createLogger("telegram-link");

/**
 * Conexão do Telegram com um clique, sem webhook:
 *  1. POST /api/telegram/link gera um código de uso único (15 min) e devolve t.me/<bot>?start=<código>.
 *  2. O usuário toca em "Iniciar"; o Telegram envia ao bot a mensagem "/start <código>".
 *  3. POST /api/telegram/link/check lê getUpdates, associa o chat ao dono do código e confirma
 *     ao Telegram (offset) só as atualizações já tratadas ou que não pertencem a nenhum código pendente.
 * Cada verificação processa os códigos pendentes de todos os usuários, então nenhuma mensagem
 * "/start" de outro usuário fica presa ou é descartada.
 */

export const LINK_TTL_SEC = 15 * 60;
export const LINK_CONFIRMATION_TEXT = "CryptoScanner conectado. Você vai receber aqui os alertas dos seus agentes e monitores.";

const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const codeKey = (code: string) => `tglink:code:${code}`;
const userKey = (userId: string) => `tglink:user:${userId}`;
const doneKey = (userId: string) => `tglink:done:${userId}`;
const claimKey = (code: string) => `tglink:claim:${code}`;

/** Código URL-safe (base64url de 18 bytes = 24 caracteres), aceito no parâmetro start do Telegram. */
export function generateLinkCode(): string {
  return randomBytes(18).toString("base64url");
}

/** Extrai o código de "/start <código>" (também "/start@Bot <código>"). Retorna null para qualquer outro texto. */
export function extractStartCode(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = /^\/start(?:@[A-Za-z0-9_]+)?\s+(\S+)\s*$/.exec(text.trim());
  if (!m) return null;
  const code = m[1]!;
  return CODE_RE.test(code) ? code : null;
}

export interface LinkMatch {
  updateId: number;
  code: string;
  userId: string;
  chatId: string;
}

/**
 * Casa as atualizações com os códigos pendentes (código → userId). Só aceita chats privados.
 * Um mesmo código aparece uma única vez no resultado (a primeira ocorrência).
 */
export function pickMatches(updates: TelegramUpdate[], pending: ReadonlyMap<string, string>): LinkMatch[] {
  const seen = new Set<string>();
  const out: LinkMatch[] = [];
  for (const u of [...updates].sort((a, b) => a.update_id - b.update_id)) {
    const msg = u.message;
    if (!msg || msg.chat?.type !== "private") continue;
    const code = extractStartCode(msg.text);
    if (!code || seen.has(code)) continue;
    const userId = pending.get(code);
    if (!userId) continue;
    seen.add(code);
    out.push({ updateId: u.update_id, code, userId, chatId: String(msg.chat.id) });
  }
  return out;
}

/**
 * Offset a enviar ao Telegram para confirmar atualizações: avança pelo maior prefixo contíguo
 * (em ordem de update_id) que não contém atualização bloqueada (código pendente ainda não tratado).
 * Retorna null quando não há nada a confirmar.
 */
export function computeAckOffset(updates: TelegramUpdate[], blocked: ReadonlySet<number>): number | null {
  let offset: number | null = null;
  for (const u of [...updates].sort((a, b) => a.update_id - b.update_id)) {
    if (blocked.has(u.update_id)) break;
    offset = u.update_id + 1;
  }
  return offset;
}

export function telegramDeepLink(code: string): string {
  return `https://t.me/${getEnv().TELEGRAM_BOT_USERNAME}?start=${code}`;
}

/** Gera um novo código para o usuário (invalida o anterior) e devolve o deep link. */
export async function createLinkCode(userId: string): Promise<{ code: string; url: string; expiresInSec: number }> {
  const cache = getCache();
  const previous = await cache.get<string>(userKey(userId));
  if (previous) await cache.del(codeKey(previous));
  await cache.del(doneKey(userId));
  const code = generateLinkCode();
  await cache.set(codeKey(code), userId, LINK_TTL_SEC);
  await cache.set(userKey(userId), code, LINK_TTL_SEC);
  return { code, url: telegramDeepLink(code), expiresInSec: LINK_TTL_SEC };
}

async function completeLink(match: LinkMatch): Promise<boolean> {
  const cache = getCache();
  // Reivindicação atômica: duas verificações simultâneas não gravam nem confirmam duas vezes.
  if ((await cache.incr(claimKey(match.code), 120)) !== 1) return true;
  await requirePrisma().user.update({ where: { id: match.userId }, data: { telegramChatId: match.chatId } });
  await cache.del(codeKey(match.code));
  if ((await cache.get<string>(userKey(match.userId))) === match.code) await cache.del(userKey(match.userId));
  await cache.set(doneKey(match.userId), true, LINK_TTL_SEC);
  const sent = await sendTelegramMessage(match.chatId, LINK_CONFIRMATION_TEXT);
  if (!sent.ok) log.warn("chat associado, mas a confirmação não foi enviada", { error: sent.error });
  return true;
}

/**
 * Lê getUpdates, conclui todas as conexões pendentes encontradas e confirma ao Telegram o que foi
 * tratado. Retorna se o usuário informado está conectado por este fluxo.
 * Lança TelegramWebhookConflictError quando o bot tem webhook (409).
 */
export async function checkLink(userId: string): Promise<{ connected: boolean }> {
  const cache = getCache();
  if (await cache.get<boolean>(doneKey(userId))) {
    await cache.del(doneKey(userId));
    return { connected: true };
  }
  if (!(await cache.get<string>(userKey(userId)))) return { connected: false };

  const updates = await getTelegramUpdates();
  if (updates.length === 0) return { connected: false };

  const codes = new Set<string>();
  for (const u of updates) {
    if (u.message?.chat?.type !== "private") continue;
    const c = extractStartCode(u.message.text);
    if (c) codes.add(c);
  }
  const pending = new Map<string, string>();
  for (const c of codes) {
    const owner = await cache.get<string>(codeKey(c));
    if (owner) pending.set(c, owner);
  }

  const blocked = new Set<number>();
  for (const m of pickMatches(updates, pending)) {
    try {
      await completeLink(m);
    } catch (err) {
      log.warn("falha ao concluir conexão do Telegram", { error: (err as Error).message });
      await cache.del(claimKey(m.code));
      blocked.add(m.updateId);
    }
  }
  // Uma segunda mensagem "/start <código>" com código já tratado não bloqueia; só a que falhou.
  const offset = computeAckOffset(updates, blocked);
  if (offset !== null) {
    try {
      await getTelegramUpdates({ offset, limit: 1 });
    } catch (err) {
      log.warn("falha ao confirmar atualizações do Telegram", { error: (err as Error).message });
    }
  }

  if (await cache.get<boolean>(doneKey(userId))) {
    await cache.del(doneKey(userId));
    return { connected: true };
  }
  return { connected: false };
}

/** Desconecta o Telegram do usuário e invalida qualquer código pendente. */
export async function disconnectTelegram(userId: string): Promise<void> {
  const cache = getCache();
  const previous = await cache.get<string>(userKey(userId));
  if (previous) await cache.del(codeKey(previous));
  await cache.del(userKey(userId));
  await cache.del(doneKey(userId));
  await requirePrisma().user.update({ where: { id: userId }, data: { telegramChatId: null } });
}
