import { connection } from "next/server";
import { enforceRateLimit, ok, withApi } from "@/lib/api";
import { getSystemStatus } from "@/services/status-service";

/** Estado operacional: banco, cache, provedores de mercado e execução dos jobs agendados. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  return ok(await getSystemStatus());
});
