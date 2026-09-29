import { connection } from "next/server";
import { ok, requireUser, withApi } from "@/lib/api";
import { isBillingConfigured, priceFor } from "@/services/billing/mercadopago";
import { getAccess } from "@/services/subscription-service";

/** Assinatura/trial do usuário e entitlements efetivos (decididos no servidor). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const access = await getAccess(user.id);
  return ok({ ...access, billing: { provider: "mercadopago", configured: isBillingConfigured(), prices: { PRO: priceFor("PRO"), ELITE: priceFor("ELITE") }, currency: "BRL" } });
});
