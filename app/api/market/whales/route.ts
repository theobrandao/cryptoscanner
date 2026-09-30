import { connection } from "next/server";
import { enforceRateLimit, ok, withApi } from "@/lib/api";
import { getWhaleSnapshot } from "@/services/onchain/whales";
import { requireCoreUser } from "@/services/subscription-service";

/** Grandes transações on-chain (≥ 50 BTC) dos últimos blocos, coletadas pelo cron. */
export const GET = withApi(async (req) => {
  await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const snap = await getWhaleSnapshot();
  return ok({ snapshot: snap, available: snap !== null, source: "blockchain.info (público)", note: "Sem rotulagem de carteiras de corretoras (serviço pago); classificação pela forma da transação." });
});
