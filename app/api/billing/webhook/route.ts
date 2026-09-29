import { connection } from "next/server";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { ApiError, ok, withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { checkWebhookSignature, getPreapproval, mapPreapprovalStatus } from "@/services/billing/mercadopago";
import { track } from "@/services/analytics-service";
import { sendTemplate } from "@/services/email-service";

const log = createLogger("billing-webhook");

/**
 * Webhook do Mercado Pago. Assinatura x-signature obrigatória; idempotente por x-request-id.
 * Nunca confia no corpo: relê o preapproval na API antes de mudar o acesso.
 */
export const POST = withApi(async (req) => {
  await connection();
  const url = new URL(req.url);
  const raw = await req.text();
  let body: { type?: string; action?: string; data?: { id?: string } } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "JSON inválido", "invalid_json");
  }
  // o manifesto da assinatura usa o data.id da query string (documentação do Mercado Pago); corpo como reserva
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const sig = checkWebhookSignature(req.headers, dataId);
  if (!sig.ok) {
    log.warn("webhook recusado", { reason: sig.reason, ...(sig.detail ?? {}) });
    throw new ApiError(401, "Assinatura inválida", "invalid_signature");
  }
  const prisma = getPrisma();
  if (!prisma) throw new ApiError(503, "Banco indisponível", "db_unavailable");
  const type = body.type ?? url.searchParams.get("type") ?? "unknown";
  const eventKey = `mercadopago:${req.headers.get("x-request-id") ?? `${type}:${dataId}:${Date.now()}`}`;
  try {
    await prisma.billingEvent.create({ data: { provider: "mercadopago", eventKey, type, resourceId: dataId ?? null, payload: body as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return ok({ duplicate: true });
    throw err;
  }
  if (!dataId || !type.includes("preapproval")) {
    await prisma.billingEvent.update({ where: { eventKey }, data: { processed: true } });
    return ok({ ignored: type });
  }
  try {
    const pre = await getPreapproval(dataId);
    const [userId, plan] = (pre.external_reference ?? "").split(":");
    const status = mapPreapprovalStatus(pre.status);
    if (userId && status && (plan === "PRO" || plan === "ELITE")) {
      const next = pre.next_payment_date ? new Date(pre.next_payment_date) : null;
      const before = await prisma.subscription.findUnique({ where: { userId }, select: { status: true, plan: true } });
      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan, status, provider: "mercadopago", providerSubscriptionId: pre.id, currentPeriodEnd: next, lastPaymentStatus: pre.status },
        update: { plan, status, provider: "mercadopago", providerSubscriptionId: pre.id, currentPeriodEnd: next, lastPaymentStatus: pre.status, cancelAtPeriodEnd: status === "CANCELLED" },
      });
      const u = await prisma.user.update({ where: { id: userId }, data: { plan: status === "ACTIVE" ? (plan === "ELITE" ? "PLATINUM" : "PRO") : undefined }, select: { email: true, name: true } });
      // avisos só na transição de estado (reentrega do mesmo evento não repete e-mail)
      if (before?.status !== status || before?.plan !== plan) {
        if (status === "ACTIVE") {
          await track("subscription_activated", { userId, props: { plan } });
          void sendTemplate("subscription_active", { to: u.email, name: u.name, plan }).catch(() => undefined);
        } else if (status === "PAST_DUE") {
          await track("payment_failed", { userId, props: { plan } });
          void sendTemplate("payment_failed", { to: u.email, name: u.name }).catch(() => undefined);
        } else if (status === "CANCELLED") await track("subscription_cancelled", { userId, props: { plan } });
      }
    }
    await prisma.billingEvent.update({ where: { eventKey }, data: { processed: true } });
    log.info("preapproval processado", { id: pre.id, status: pre.status, userId });
    return ok({ processed: true });
  } catch (err) {
    await prisma.billingEvent.update({ where: { eventKey }, data: { error: (err as Error).message.slice(0, 500) } });
    // 500 faz o Mercado Pago reenviar (retry)
    throw err;
  }
});
