import webpush from "web-push";
import { getPrisma } from "@/database/client";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("push");

export interface PushPayload {
  title: string;
  body: string;
  /** rota aberta ao clicar na notificação */
  url?: string;
  /** notificações com a mesma tag se substituem */
  tag?: string;
}

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const env = getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return (configured = false);
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return (configured = true);
}

export function getVapidPublicKey(): string | null {
  return getEnv().VAPID_PUBLIC_KEY ?? null;
}

/** Envia para todos os navegadores inscritos do usuário. Inscrições expiradas (404/410) são removidas. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const prisma = getPrisma();
  if (!prisma || !isPushConfigured()) return { sent: 0, removed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let removed = 0;
  const body = JSON.stringify({ title: payload.title, body: payload.body.slice(0, 300), url: payload.url ?? "/", tag: payload.tag });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        removed++;
      } else {
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastError: `${status ?? ""} ${(err as Error).message}`.slice(0, 300) } }).catch(() => undefined);
        log.warn("push falhou", { status, error: (err as Error).message });
      }
    }
  }
  return { sent, removed };
}

/** Aviso operacional aos administradores (ex.: falhas seguidas do cron). */
export async function notifyAdmins(payload: PushPayload): Promise<number> {
  const prisma = getPrisma();
  if (!prisma) return 0;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  let sent = 0;
  for (const a of admins) sent += (await sendPushToUser(a.id, payload)).sent;
  return sent;
}
