import { connection } from "next/server";
import { enforceRateLimit, ok, withApi } from "@/lib/api";
import { getVenueStatuses } from "@/services/market/venues";

/** Market Data Status: disponibilidade, latência e última atualização por exchange (cache 30 s). Público. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  return ok({ checkedAt: Date.now(), venues: await getVenueStatuses() });
});
