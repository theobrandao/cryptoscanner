import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, NO_STORE, ok, parseQuery, withApi } from "@/lib/api";
import { parseTimeframe } from "@/lib/timeframes";
import { getScannerTable } from "@/services/scanner-service";
import { requireCoreUser, requireTimeframe } from "@/services/subscription-service";

const querySchema = z.object({
  timeframe: z.string().default("4h"),
  refresh: z.enum(["1", "0"]).optional(),
});

/** Tabela em tempo real do scanner (métricas por ativo). */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const tf = parseTimeframe(q.timeframe);
  const user = await requireCoreUser(req);
  requireTimeframe(user.access, tf, "scanner");
  // refresh=1 refaz o scan dos ativos na origem: balde caro por usuário
  if (q.refresh === "1") await enforceRateLimit(req, "scanner_refresh", `u:${user.id}`);
  const res = await getScannerTable(tf, q.refresh === "1");
  return ok(
    JSON.parse(
      JSON.stringify(res, (_k, v) =>
        typeof v === "number" && !Number.isFinite(v) ? null : v,
      ),
    ),
    { headers: NO_STORE },
  );
});
