import { connection } from "next/server";
import { ApiError, enforceRateLimit, ok, requireUser, withApi } from "@/lib/api";
import { isPushConfigured, sendPushToUser } from "@/services/push-service";

/** Envia uma notificação de teste para os navegadores inscritos do usuário. */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await enforceRateLimit(req, "auth", `push-test:${user.id}`);
  if (!isPushConfigured()) throw new ApiError(503, "Push não configurado (VAPID ausente)", "push_disabled");
  const r = await sendPushToUser(user.id, { title: "CryptoScanner", body: "Notificação de teste recebida.", url: "/preferencias", tag: "test" });
  return ok(r);
});
