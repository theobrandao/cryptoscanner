import { createHash } from "node:crypto";
import { connection } from "next/server";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { ApiError, ok, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { checkKiwifySignature, getKiwifySale, isKiwifyApiConfigured, parseKiwifyEvent, planFromKiwify, recordKiwifyGrant } from "@/services/billing/kiwify";

const log = createLogger("kiwify-webhook");

/**
 * Webhook da Kiwify (Apps › Webhooks). URL: {APP}/api/billing/kiwify — token do webhook em KIWIFY_WEBHOOK_TOKEN.
 * Idempotente pelo hash do corpo; evento mais antigo que o último aplicado na assinatura é ignorado. 200 para eventos que não mudam acesso (evita reenvio infinito); 500 em falha transitória.
 */
export const POST = withApi(async (req) => {
  await connection();
  const env = getEnv();
  if (!env.KIWIFY_WEBHOOK_TOKEN) throw new ApiError(503, "Webhook da Kiwify não configurado", "billing_disabled");
  const url = new URL(req.url);
  const raw = await req.text();
  const sig = checkKiwifySignature(raw, url.searchParams.get("signature") ?? req.headers.get("x-kiwify-signature"), env.KIWIFY_WEBHOOK_TOKEN);
  if (!sig.ok) {
    log.warn("webhook recusado", { reason: sig.reason, ...(sig.detail ?? {}) });
    throw new ApiError(401, "Assinatura inválida", "invalid_signature");
  }
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "JSON inválido", "invalid_json");
  }
  const prisma = getPrisma();
  if (!prisma) throw new ApiError(503, "Banco indisponível", "db_unavailable");
  const ev = parseKiwifyEvent(body);
  const eventKey = `kiwify:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
  // sem dados pessoais no registro do evento: tipo, ids e as chaves do corpo (para mapear o formato)
  const summary = { kind: ev.kind, rawType: ev.rawType, eventAt: ev.eventAt?.toISOString() ?? null, orderId: ev.orderId, subscriptionId: ev.subscriptionId, productId: ev.productId, productName: ev.productName, planName: ev.planName, variant: sig.variant, keys: body && typeof body === "object" ? Object.keys(body as object).slice(0, 40) : [] };
  try {
    await prisma.billingEvent.create({ data: { provider: "kiwify", eventKey, type: ev.rawType, resourceId: ev.subscriptionId ?? ev.orderId, payload: summary as Prisma.InputJsonValue } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    // reentrega: só ignora se o anterior foi processado (falha anterior → processa de novo)
    const prev = await prisma.billingEvent.findUnique({ where: { eventKey }, select: { processed: true } });
    if (prev?.processed) return ok({ duplicate: true });
  }
  const done = (extra: { error?: string } = {}) => prisma.billingEvent.update({ where: { eventKey }, data: { processed: true, ...extra } });
  if (ev.kind === "ignored") {
    await done();
    log.info("evento sem efeito no acesso", { rawType: ev.rawType, variant: sig.variant });
    return ok({ ignored: ev.rawType });
  }
  const plan = planFromKiwify(ev, { pro: env.KIWIFY_PRODUCT_PRO_ID, elite: env.KIWIFY_PRODUCT_ELITE_ID });
  if (!ev.orderId && !ev.subscriptionId) {
    await done({ error: "sem id de pedido/assinatura" });
    log.warn("evento sem id", { keys: summary.keys });
    return ok({ ignored: "missing_id" });
  }
  if (!plan) {
    await done({ error: "produto não mapeado para PRO/ELITE" });
    log.warn("produto não mapeado", { productId: ev.productId, productName: ev.productName, planName: ev.planName });
    return ok({ ignored: "unknown_product" });
  }
  try {
    let email = ev.email;
    if (isKiwifyApiConfigured() && ev.orderId && (ev.kind === "approved" || ev.kind === "renewed")) {
      const sale = await getKiwifySale(ev.orderId);
      if (sale.status !== "paid") {
        await done({ error: `venda com status ${sale.status ?? "?"} na API` });
        return ok({ ignored: "not_paid" });
      }
      email = sale.email ?? email;
    }
    if (!email) {
      await done({ error: "sem e-mail do comprador" });
      return ok({ ignored: "missing_email" });
    }
    const r = await recordKiwifyGrant({ externalId: ev.subscriptionId ?? ev.orderId!, email, plan, kind: ev.kind, orderId: ev.orderId, nextPayment: ev.nextPayment, eventAt: ev.eventAt });
    if (r.stale) {
      // reentrega antiga (fora de ordem): registrada, sem mudar o acesso
      await done({ error: "evento mais antigo que o último aplicado" });
      return ok({ processed: true, stale: true, status: r.status });
    }
    await done();
    return ok({ processed: true, applied: Boolean(r.userId), status: r.status });
  } catch (err) {
    await prisma.billingEvent.update({ where: { eventKey }, data: { error: (err as Error).message.slice(0, 500) } });
    throw err;
  }
});
