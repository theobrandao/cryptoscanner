import { connection } from "next/server";
import { getPrisma } from "@/database/client";
import { ApiError, ok, requireUser, withApi } from "@/lib/api";
import { cancelPreapproval } from "@/services/billing/mercadopago";

/** Cancela a renovação; o acesso continua até o fim do período pago. Compras da Kiwify são canceladas na Kiwify. */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = getPrisma();
  const sub = await prisma?.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.providerSubscriptionId) throw new ApiError(404, "Nenhuma assinatura paga ativa", "not_found");
  if (sub.provider === "kiwify")
    throw new ApiError(409, "Sua assinatura foi comprada na Kiwify: cancele pelo e-mail de compra da Kiwify ou fale com o suporte. O acesso segue até o fim do período pago.", "cancel_at_provider");
  await cancelPreapproval(sub.providerSubscriptionId);
  await prisma!.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelAtPeriodEnd: true } });
  return ok({ cancelled: true, accessUntil: sub.currentPeriodEnd });
});
