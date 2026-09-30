import { connection } from "next/server";
import { getPrisma } from "@/database/client";
import { ok, requireUser, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { isKiwifyConfigured } from "@/services/billing/kiwify";
import { isBillingConfigured, priceFor } from "@/services/billing/mercadopago";
import { getAccess } from "@/services/subscription-service";

const log = createLogger("billing");

/** O que a conta tem salvo (contagens reais), exibido em /planos quando o teste ou a assinatura terminou. */
interface SavedCounts {
  monitors: number;
  strategies: number;
  favorites: number;
  agents: number;
  sentinels: number;
  alerts: number;
}

async function savedCounts(userId: string): Promise<SavedCounts | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const [monitors, strategies, favorites, agents, sentinels, alerts] = await Promise.all([
      prisma.monitor.count({ where: { userId } }),
      prisma.strategy.count({ where: { userId } }),
      prisma.watchlistItem.count({ where: { watchlist: { userId } } }),
      prisma.agent.count({ where: { userId, kind: "agent" } }),
      prisma.agent.count({ where: { userId, kind: "sentinel" } }),
      prisma.alert.count({ where: { userId } }),
    ]);
    return { monitors, strategies, favorites, agents, sentinels, alerts };
  } catch (err) {
    log.warn("contagens da conta indisponíveis", { error: (err as Error).message });
    return null;
  }
}

/** Assinatura/trial do usuário e entitlements efetivos (decididos no servidor). `?saved=1` inclui as contagens do que está salvo. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const access = await getAccess(user.id);
  const provider = getEnv().BILLING_PROVIDER;
  const saved = new URL(req.url).searchParams.get("saved") === "1" ? await savedCounts(user.id) : undefined;
  return ok({ ...access, billing: { provider, configured: provider === "kiwify" ? isKiwifyConfigured() : isBillingConfigured(), prices: { PRO: priceFor("PRO"), ELITE: priceFor("ELITE") }, currency: "BRL" }, ...(saved !== undefined ? { saved } : {}) });
});
