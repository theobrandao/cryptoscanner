import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ok, parseBody, requireUser, withApi } from "@/lib/api";
import { getVapidPublicKey, isPushConfigured } from "@/services/push-service";

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Chave pública VAPID e quantidade de navegadores inscritos do usuário. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const count = await requirePrisma().pushSubscription.count({ where: { userId: user.id } });
  return ok({ configured: isPushConfigured(), publicKey: getVapidPublicKey(), subscriptions: count });
});

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, subSchema);
  const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  await requirePrisma().pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: { userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: ua },
    update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: ua, lastError: null },
  });
  return ok({ subscribed: true }, { status: 201 });
});

export const DELETE = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ endpoint: z.string().url().max(1000) }));
  const res = await requirePrisma().pushSubscription.deleteMany({ where: { userId: user.id, endpoint: body.endpoint } });
  return ok({ removed: res.count });
});
