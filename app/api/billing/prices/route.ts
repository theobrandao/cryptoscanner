import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { legalStatus } from "@/lib/env";
import { TRIAL_DAYS, ENTITLEMENTS } from "@/lib/entitlements";
import { isBillingConfigured, priceFor } from "@/services/billing/mercadopago";

/** Preços públicos (landing e página de planos) e se o checkout está liberado. */
export const GET = withApi(async () => {
  await connection();
  return ok({
    currency: "BRL",
    trialDays: TRIAL_DAYS,
    prices: { PRO: priceFor("PRO"), ELITE: priceFor("ELITE") },
    limits: {
      PRO: { alerts: ENTITLEMENTS.PRO.maxAlerts, monitors: ENTITLEMENTS.PRO.maxMonitors, strategies: ENTITLEMENTS.PRO.maxStrategies, historyDays: ENTITLEMENTS.PRO.historyDays },
      ELITE: { alerts: ENTITLEMENTS.ELITE.maxAlerts, monitors: ENTITLEMENTS.ELITE.maxMonitors, strategies: ENTITLEMENTS.ELITE.maxStrategies, historyDays: ENTITLEMENTS.ELITE.historyDays },
    },
    checkoutEnabled: isBillingConfigured() && legalStatus().ready,
  });
});
