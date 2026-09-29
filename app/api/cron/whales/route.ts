import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { assertCronAuth, recordCronRun } from "@/lib/cron";
import { getTicker } from "@/services/market/market-service";
import { collectWhales } from "@/services/onchain/whales";

export const maxDuration = 60;

/** Coleta de grandes transações on-chain (bloco mais recente). Agendar a cada 10 min (QStash) com o mesmo CRON_SECRET. */
async function handle(req: Request) {
  await connection();
  assertCronAuth(req);
  const t0 = Date.now();
  const btc = await getTicker("BTC").catch(() => undefined);
  let res: Awaited<ReturnType<typeof collectWhales>>;
  try {
    res = await collectWhales({ thresholdBtc: 50, btcUsd: btc?.price ?? null, timeoutMs: 50_000 });
  } catch (err) {
    await recordCronRun("whales", t0, { ok: false, detail: { error: (err as Error).message } });
    throw err;
  }
  await recordCronRun("whales", t0, { ok: true, detail: { durationMs: Date.now() - t0 } });
  return ok({ ...res, durationMs: Date.now() - t0 });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
