import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, NO_STORE, ok, parseQuery, withApi } from "@/lib/api";
import { allowsTimeframe } from "@/lib/access-policy";
import { createLogger } from "@/lib/logger";
import { ASSET_SYMBOLS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { detectVolumeAnomaly, type VolumeAnomaly } from "@/lib/scanner/volume";
import { getCandles } from "@/services/market/market-service";
import { createLimiter } from "@/services/market/providers/types";
import type { Timeframe } from "@/types/market";
import { requireCoreUser } from "@/services/subscription-service";

const log = createLogger("scanner-volume");
/** Texto fixo para falha de fonte de dados (a causa fica só no log). */
const PROVIDER_UNAVAILABLE = "Dados indisponíveis no momento para este ativo.";

const querySchema = z.object({ timeframes: z.string().default("30m,1h"), threshold: z.coerce.number().min(10).max(1000).default(100) });

/**
 * Monitor de volume anômalo (30M e 1H por padrão) nos 30 ativos. Timeframes fora do plano são descartados
 * (abaixo de 4H só no ELITE); sem nenhum liberado, usa o 4H.
 */
export const GET = withApi(async (req) => {
  const user = await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const tfs = q.timeframes
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Timeframe => ["5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(s))
    .filter((tf) => allowsTimeframe(user.access.tier, tf, "scanner"));
  if (tfs.length === 0) tfs.push("4h");
  const key = `volume-monitor:${tfs.join(",")}:${q.threshold}`;
  const res = await cached<{ alerts: VolumeAnomaly[]; errors: Array<{ symbol: string; timeframe: Timeframe; code: "provider_unavailable"; message: string }>; checkedAt: number; sources: string[] }>(key, 45, async () => {
    const limiter = createLimiter(4, 0);
    const alerts: VolumeAnomaly[] = [];
    const errors: Array<{ symbol: string; timeframe: Timeframe; code: "provider_unavailable"; message: string }> = [];
    const sources = new Set<string>();
    await Promise.all(
      ASSET_SYMBOLS.flatMap((symbol) =>
        tfs.map((tf) =>
          limiter(async () => {
            try {
              const s = await getCandles(symbol, tf, { limit: 60, includeForming: true });
              sources.add(s.source);
              const a = detectVolumeAnomaly(symbol, tf, s.candles, { thresholdPct: q.threshold });
              if (a) alerts.push(a);
            } catch (err) {
              log.warn("falha ao ler candles", { symbol, tf, error: (err as Error).message });
              errors.push({ symbol, timeframe: tf, code: "provider_unavailable", message: PROVIDER_UNAVAILABLE });
            }
          }),
        ),
      ),
    );
    alerts.sort((a, b) => b.increasePct - a.increasePct);
    return { alerts, errors, checkedAt: Date.now(), sources: [...sources] };
  });
  return ok({ ...res.value, stale: res.stale, assets: ASSET_SYMBOLS.length, timeframes: tfs, threshold: q.threshold }, { headers: NO_STORE });
});
