import { connection } from "next/server";
import { enforceRateLimit, ok, withApi } from "@/lib/api";
import { getMarketOverview } from "@/services/market-overview-service";

/** Market overview: capitalização total, volume, dominância BTC/ETH, Medo & Ganância, maiores altas/baixas e volume. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  return ok(await getMarketOverview());
});
