import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, requireUser, withApi } from "@/lib/api";
import { requireEntitlement } from "@/services/subscription-service";
import { parseTimeframe } from "@/lib/timeframes";
import { getSetupRanking } from "@/services/market-overview-service";

export const maxDuration = 60;

/** Ranking técnico de setups por Confluence Score (não é recomendação). */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  await requireEntitlement(await requireUser(req));
  const q = parseQuery(req, z.object({ tf: z.string().default("4h") }));
  return ok(await getSetupRanking(parseTimeframe(q.tf)));
});
