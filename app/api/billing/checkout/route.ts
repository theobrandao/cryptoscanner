import { connection } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/database/client";
import { ApiError, enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createPreapproval, isBillingConfigured } from "@/services/billing/mercadopago";

const log = createLogger("billing");

/** Inicia a assinatura PRO/ELITE no Mercado Pago e devolve a URL de pagamento (init_point). */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await enforceRateLimit(req, "auth", `checkout:${user.id}`);
  const body = await parseBody(req, z.object({ plan: z.enum(["PRO", "ELITE"]) }));
  if (!isBillingConfigured()) throw new ApiError(503, "Cobrança ainda não configurada. Fale com o suporte.", "billing_disabled");
  const pre = await createPreapproval({ userId: user.id, email: user.email, plan: body.plan, backUrl: `${getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/planos?checkout=return` });
  if (!pre.init_point) throw new ApiError(502, "Mercado Pago não retornou link de pagamento", "billing_error");
  await getPrisma()?.billingEvent.create({ data: { provider: "mercadopago", eventKey: `checkout:${pre.id}`, type: "checkout_started", resourceId: pre.id, payload: { plan: body.plan, userId: user.id }, processed: true } });
  log.info("checkout iniciado", { userId: user.id, plan: body.plan, preapproval: pre.id });
  return ok({ url: pre.init_point, preapprovalId: pre.id });
});
