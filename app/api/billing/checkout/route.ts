import { connection } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/database/client";
import { ApiError, enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { getEnv, legalStatus } from "@/lib/env";
import { track } from "@/services/analytics-service";
import { createLogger } from "@/lib/logger";
import { isKiwifyConfigured, kiwifyCheckoutUrl } from "@/services/billing/kiwify";
import { createPreapproval, isBillingConfigured } from "@/services/billing/mercadopago";

const log = createLogger("billing");
/** Texto neutro para o usuário (sem nome de provedor); a causa vai só para o log. */
const CHECKOUT_FAILED = "Não foi possível iniciar o pagamento. Tente novamente.";

/**
 * Inicia a assinatura PRO/ELITE e devolve a URL de pagamento.
 * Kiwify: link de checkout do plano (o acesso é liberado pelo webhook para o e-mail da compra).
 * Mercado Pago: cria o preapproval e devolve o init_point.
 */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await enforceRateLimit(req, "auth", `checkout:${user.id}`);
  const body = await parseBody(req, z.object({ plan: z.enum(["PRO", "ELITE"]) }));
  const env = getEnv();
  const kiwify = env.BILLING_PROVIDER === "kiwify";
  if (!(kiwify ? isKiwifyConfigured() : isBillingConfigured())) throw new ApiError(503, "Pagamento indisponível no momento. Tente novamente mais tarde ou fale com o suporte.", "billing_disabled");
  // venda só com fornecedor identificado e termos aprovados (revisão humana; ver /admin)
  if (!legalStatus().ready) throw new ApiError(503, "Assinaturas pagas liberadas após a publicação dos termos definitivos.", "legal_pending");
  if (kiwify) {
    const url = kiwifyCheckoutUrl(body.plan);
    if (!url) {
      log.error("link de checkout Kiwify ausente ou inválido", { plan: body.plan });
      throw new ApiError(502, CHECKOUT_FAILED, "billing_error");
    }
    await track("checkout_started", { userId: user.id, props: { plan: body.plan, provider: "kiwify" } });
    log.info("checkout Kiwify", { userId: user.id, plan: body.plan });
    return ok({ url, provider: "kiwify", email: user.email });
  }
  let pre: Awaited<ReturnType<typeof createPreapproval>>;
  try {
    pre = await createPreapproval({ userId: user.id, email: user.email, plan: body.plan, backUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/planos?checkout=return` });
  } catch (err) {
    log.error("falha ao criar preapproval", { userId: user.id, plan: body.plan, error: (err as Error).message });
    throw new ApiError(502, CHECKOUT_FAILED, "billing_error");
  }
  if (!pre.init_point) {
    log.error("preapproval sem link de pagamento", { userId: user.id, preapproval: pre.id });
    throw new ApiError(502, CHECKOUT_FAILED, "billing_error");
  }
  await getPrisma()?.billingEvent.create({ data: { provider: "mercadopago", eventKey: `checkout:${pre.id}`, type: "checkout_started", resourceId: pre.id, payload: { plan: body.plan, userId: user.id }, processed: true } });
  await track("checkout_started", { userId: user.id, props: { plan: body.plan } });
  log.info("checkout iniciado", { userId: user.id, plan: body.plan, preapproval: pre.id });
  return ok({ url: pre.init_point, preapprovalId: pre.id, provider: "mercadopago" });
});
