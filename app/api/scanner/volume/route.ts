import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { ASSET_SYMBOLS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { detectVolumeAnomaly, type VolumeAnomaly } from "@/lib/scanner/volume";
import { getCandles } from "@/services/market/market-service";
import { createLimiter } from "@/services/market/providers/types";
import type { Timeframe } from "@/types/market";

const querySchema = z.object({ timeframes: z.string().default("30m,1h"), threshold: z.coerce.number().min(10).max(1000).default(100) });

/** Monitor de volume anômalo (30M e 1H por padrão) nos 20 ativos. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const tfs = q.timeframes
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Timeframe => ["5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(s));
  const key = `volume-monitor:${tfs.join(",")}:${q.threshold}`;
  const res = await cached<{ alerts: VolumeAnomaly[]; errors: string[]; checkedAt: number; sources: string[] }>(key, 45, async () => {
    const limiter = createLimiter(4, 0);
    const alerts: VolumeAnomaly[] = [];
    const errors: string[] = [];
    const sources = new Set<string>();
    await Promise.all(
      ASSET_SYMBOLS.flatMap((symbol) =>
        tfs.map((tf) =>
          limiter(async () => {
            try {
              const s = await getCandles(symbol, tf, { limit: 60 });
              sources.add(s.source);
              const a = detectVolumeAnomaly(symbol, tf, s.candles, { thresholdPct: q.threshold });
              if (a) alerts.push(a);
            } catch (err) {
              errors.push(`${symbol} ${tf}: ${(err as Error).message}`);
            }
          }),
        ),
      ),
    );
    alerts.sort((a, b) => b.increasePct - a.increasePct);
    return { alerts, errors, checkedAt: Date.now(), sources: [...sources] };
  });
  return ok({ ...res.value, stale: res.stale, assets: ASSET_SYMBOLS.length, timeframes: tfs, threshold: q.threshold });
});
