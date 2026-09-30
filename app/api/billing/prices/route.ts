import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { ENTITLEMENTS } from "@/lib/entitlements";
import { getPublicPrices } from "@/lib/billing/public-prices";
import { isKiwifyConfigured } from "@/services/billing/kiwify";
import { isBillingConfigured, verifyBillingAccount } from "@/services/billing/mercadopago";

/** Preços públicos (landing, página de vendas e planos), canal de venda e se o checkout está liberado. */
export const GET = withApi(async () => {
  await connection();
  const pub = getPublicPrices();
  const kiwify = pub.provider === "kiwify";
  const account = !kiwify && isBillingConfigured() ? await verifyBillingAccount() : null;
  return ok({
    currency: "BRL",
    trialDays: pub.trialDays,
    /** o teste grátis vale só para o PRO */
    trialPlan: "PRO" as const,
    provider: pub.provider,
    prices: pub.prices,
    limits: {
      PRO: { alerts: ENTITLEMENTS.PRO.maxAlerts, monitors: ENTITLEMENTS.PRO.maxMonitors, strategies: ENTITLEMENTS.PRO.maxStrategies, historyDays: ENTITLEMENTS.PRO.historyDays },
      ELITE: { alerts: ENTITLEMENTS.ELITE.maxAlerts, monitors: ENTITLEMENTS.ELITE.maxMonitors, strategies: ENTITLEMENTS.ELITE.maxStrategies, historyDays: ENTITLEMENTS.ELITE.historyDays },
    },
    checkoutEnabled: pub.checkoutEnabled,
    /** links públicos de checkout da Kiwify (só com checkout liberado) */
    checkoutUrls: pub.checkoutUrls,
    /** token do Mercado Pago aceito pela API (sem dados do titular) */
    billingVerified: kiwify ? isKiwifyConfigured() : Boolean(account?.ok && account.tokenKind === "production" && !account.testUser),
  });
});
