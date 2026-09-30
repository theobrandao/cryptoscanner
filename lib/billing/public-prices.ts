import { getEnv, legalStatus } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/entitlements";
import type { BillingProvider } from "@/lib/plans-copy";
import { isKiwifyConfigured, kiwifyCheckoutUrl } from "@/services/billing/kiwify";
import { isBillingConfigured, priceFor } from "@/services/billing/mercadopago";

/** Preços públicos e estado do checkout (mesmos valores de GET /api/billing/prices; /planos e /vendas usam no HTML do servidor). */
export interface PublicPrices {
  prices: { PRO: number; ELITE: number };
  checkoutEnabled: boolean;
  trialDays: number;
  provider: BillingProvider;
  checkoutUrls: { PRO: string | null; ELITE: string | null } | null;
}

/** Só no servidor: lê PRICE_*_BRL, canal de venda e se o checkout está liberado (sem chamadas externas). */
export function getPublicPrices(): PublicPrices {
  const provider = getEnv().BILLING_PROVIDER;
  const kiwify = provider === "kiwify";
  const configured = kiwify ? isKiwifyConfigured() : isBillingConfigured();
  const checkoutEnabled = configured && legalStatus().ready;
  return {
    prices: { PRO: priceFor("PRO"), ELITE: priceFor("ELITE") },
    checkoutEnabled,
    trialDays: TRIAL_DAYS,
    provider,
    checkoutUrls: kiwify && checkoutEnabled ? { PRO: kiwifyCheckoutUrl("PRO"), ELITE: kiwifyCheckoutUrl("ELITE") } : null,
  };
}
