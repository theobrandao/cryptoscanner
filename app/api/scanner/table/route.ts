import { connection } from "next/server";
import { z } from "zod";
import { ApiError, enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { planAllowsTimeframe } from "@/lib/plans";
import { parseTimeframe } from "@/lib/timeframes";
import { getScannerTable } from "@/services/scanner-service";

const querySchema = z.object({ timeframe: z.string().default("4h"), refresh: z.enum(["1", "0"]).optional() });

/** Tabela em tempo real do scanner (métricas por ativo). */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const tf = parseTimeframe(q.timeframe);
  const user = await getSessionFromRequest(req);
  if (!planAllowsTimeframe(user?.plan, tf)) throw new ApiError(403, `Timeframe ${tf.toUpperCase()} disponível apenas no plano PLATINUM`, "plan_required");
  const res = await getScannerTable(tf, q.refresh === "1");
  return ok(JSON.parse(JSON.stringify(res, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v))));
});
