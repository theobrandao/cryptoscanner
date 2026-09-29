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

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keysPromise: Promise<VapidKeys | null> | null = null;

/**
 * Chaves VAPID: do ambiente (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY) ou, na ausência, geradas uma única vez
 * e guardadas no banco (AppSetting "vapid"). Assim o push funciona sem configuração manual de segredo.
 */
async function loadVapidKeys(): Promise<VapidKeys | null> {
  const env = getEnv();
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const prisma = getPrisma();
  if (!prisma) return null;
  const existing = await prisma.appSetting.findUnique({ where: { key: "vapid" } });
  if (existing) return existing.value as unknown as VapidKeys;
  const generated = webpush.generateVAPIDKeys();
  // createMany + skipDuplicates evita corrida entre duas instâncias; relê para usar o valor vencedor
  await prisma.appSetting.createMany({ data: [{ key: "vapid", value: generated as unknown as object }], skipDuplicates: true });
  const saved = await prisma.appSetting.findUnique({ where: { key: "vapid" } });
  log.info("chaves VAPID geradas e salvas no banco");
  return (saved?.value as unknown as VapidKeys) ?? generated;
}

async function vapid(): Promise<VapidKeys | null> {
  keysPromise ??= loadVapidKeys().catch((err: unknown) => {
    keysPromise = null;
    log.warn("chaves VAPID indisponíveis", { error: (err as Error).message });
    return null;
  });
  const keys = await keysPromise;
  if (keys) webpush.setVapidDetails(getEnv().VAPID_SUBJECT, keys.publicKey, keys.privateKey);
  return keys;
}

export async function isPushConfigured(): Promise<boolean> {
  return Boolean(await vapid());
}

export async function getVapidPublicKey(): Promise<string | null> {
  return (await vapid())?.publicKey ?? null;
}

/** Envia para todos os navegadores inscritos do usuário. Inscrições expiradas (404/410) são removidas. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const prisma = getPrisma();
  if (!prisma || !(await isPushConfigured())) return { sent: 0, removed: 0 };
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
