import { connection } from "next/server";
import { ApiError, ok, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getTicker } from "@/services/market/market-service";
import { collectWhales } from "@/services/onchain/whales";

export const maxDuration = 60;

/** Coleta de grandes transações on-chain (bloco mais recente). Agendar a cada 10 min (QStash) com o mesmo CRON_SECRET. */
async function handle(req: Request) {
  await connection();
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new ApiError(503, "CRON_SECRET não configurado", "cron_disabled");
  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (provided !== secret) throw new ApiError(401, "Segredo inválido", "unauthorized");
  const t0 = Date.now();
  const btc = await getTicker("BTC").catch(() => undefined);
  const res = await collectWhales({ thresholdBtc: 50, btcUsd: btc?.price ?? null, timeoutMs: 50_000 });
  return ok({ ...res, durationMs: Date.now() - t0 });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
