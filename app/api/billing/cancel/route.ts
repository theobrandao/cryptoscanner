import { connection } from "next/server";
import { getPrisma } from "@/database/client";
import { ApiError, ok, requireUser, withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { cancelPreapproval } from "@/services/billing/mercadopago";

const log = createLogger("billing");

/** Cancela a renovação; o acesso continua até o fim do período pago. Compras da Kiwify são canceladas na Kiwify. */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = getPrisma();
  const sub = await prisma?.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.providerSubscriptionId) throw new ApiError(404, "Nenhuma assinatura paga ativa", "not_found");
  if (sub.provider === "kiwify")
    throw new ApiError(409, "Para cancelar esta assinatura, fale com o suporte (assunto: Cancelar assinatura). O acesso segue até o fim do período pago.", "cancel_at_provider");
  try {
    await cancelPreapproval(sub.providerSubscriptionId);
  } catch (err) {
    log.error("falha ao cancelar preapproval", { userId: user.id, error: (err as Error).message });
    throw new ApiError(502, "Não foi possível cancelar agora. Tente novamente.", "billing_error");
  }
  await prisma!.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelAtPeriodEnd: true } });
  return ok({ cancelled: true, accessUntil: sub.currentPeriodEnd });
});
