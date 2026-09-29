import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { getEnv, legalStatus } from "@/lib/env";
import { TRIAL_DAYS, ENTITLEMENTS } from "@/lib/entitlements";
import { isKiwifyConfigured, kiwifyCheckoutUrl } from "@/services/billing/kiwify";
import { isBillingConfigured, priceFor, verifyBillingAccount } from "@/services/billing/mercadopago";

/** Preços públicos (landing, página de vendas e planos), canal de venda e se o checkout está liberado. */
export const GET = withApi(async () => {
  await connection();
  const provider = getEnv().BILLING_PROVIDER;
  const legalReady = legalStatus().ready;
  const kiwify = provider === "kiwify";
  const configured = kiwify ? isKiwifyConfigured() : isBillingConfigured();
  const account = !kiwify && isBillingConfigured() ? await verifyBillingAccount() : null;
  const checkoutEnabled = configured && legalReady;
  return ok({
    currency: "BRL",
    trialDays: TRIAL_DAYS,
    /** o teste grátis vale só para o PRO */
    trialPlan: "PRO" as const,
    provider,
    prices: { PRO: priceFor("PRO"), ELITE: priceFor("ELITE") },
    limits: {
      PRO: { alerts: ENTITLEMENTS.PRO.maxAlerts, monitors: ENTITLEMENTS.PRO.maxMonitors, strategies: ENTITLEMENTS.PRO.maxStrategies, historyDays: ENTITLEMENTS.PRO.historyDays },
      ELITE: { alerts: ENTITLEMENTS.ELITE.maxAlerts, monitors: ENTITLEMENTS.ELITE.maxMonitors, strategies: ENTITLEMENTS.ELITE.maxStrategies, historyDays: ENTITLEMENTS.ELITE.historyDays },
    },
    checkoutEnabled,
    /** links públicos de checkout da Kiwify (só com checkout liberado) */
    checkoutUrls: kiwify && checkoutEnabled ? { PRO: kiwifyCheckoutUrl("PRO"), ELITE: kiwifyCheckoutUrl("ELITE") } : null,
    /** token do Mercado Pago aceito pela API (sem dados do titular) */
    billingVerified: kiwify ? isKiwifyConfigured() : Boolean(account?.ok && account.tokenKind === "production" && !account.testUser),
  });
});
