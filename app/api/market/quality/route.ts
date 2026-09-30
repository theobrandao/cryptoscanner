import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { parseTimeframe } from "@/lib/timeframes";
import { getQualityReport } from "@/services/data-quality-service";
import { requireCoreUser } from "@/services/subscription-service";

const querySchema = z.object({ timeframe: z.string().default("4h") });

/** Data Quality: status LIVE/DELAYED/DEGRADED/OFFLINE/FALLBACK por ativo + divergência Binance × Kraken. */
export const GET = withApi(async (req) => {
  await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  return ok(await getQualityReport(parseTimeframe(q.timeframe)));
});
