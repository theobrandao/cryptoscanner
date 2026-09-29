import { connection } from "next/server";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { ApiError, ok, withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { getPreapproval, mapPreapprovalStatus, verifyWebhookSignature } from "@/services/billing/mercadopago";

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
  const dataId = body.data?.id ?? url.searchParams.get("data.id");
  if (!verifyWebhookSignature(req.headers, dataId)) throw new ApiError(401, "Assinatura inválida", "invalid_signature");
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
      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan, status, provider: "mercadopago", providerSubscriptionId: pre.id, currentPeriodEnd: next, lastPaymentStatus: pre.status },
        update: { plan, status, provider: "mercadopago", providerSubscriptionId: pre.id, currentPeriodEnd: next, lastPaymentStatus: pre.status, cancelAtPeriodEnd: status === "CANCELLED" },
      });
      await prisma.user.update({ where: { id: userId }, data: { plan: status === "ACTIVE" ? (plan === "ELITE" ? "PLATINUM" : "PRO") : undefined } });
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
