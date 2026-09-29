import { connection } from "next/server";
import { enforceRateLimit, ok, requireUser, withApi } from "@/lib/api";
import { requireEntitlement } from "@/services/subscription-service";
import { getSignalsBoard } from "@/services/signals-service";

export const maxDuration = 60;

/** Sinais ativos e saídas recentes dos modelos validados fora da amostra (cache 5 min). */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  await requireEntitlement(user);
  return ok(await getSignalsBoard());
});
