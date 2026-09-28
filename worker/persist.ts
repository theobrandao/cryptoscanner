import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { ASSETS } from "@/lib/assets";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { createLogger } from "@/lib/logger";
import { jsonSafe } from "@/services/analysis-service";
import { getCandles, getTickers } from "@/services/market/market-service";
import type { Timeframe } from "@/types/market";

const log = createLogger("persist");

export interface PersistOptions {
  /** candles recentes gravados por ativo/timeframe (upsert) */
  candlesPerAsset?: number;
  /** orçamento de tempo; ao estourar, o restante fica para o próximo ciclo */
  timeBudgetMs?: number;
  timeframes?: Timeframe[];
}

export interface PersistResult {
  snapshots: number;
  candles: number;
  indicators: number;
  skippedByBudget: boolean;
  errors: number;
}

/**
 * Persistência de mercado compartilhada pelo worker (processo longo) e pelo endpoint de cron
 * (serverless): snapshots de ticker, candles recentes e indicadores materializados.
 */
export async function persistMarketSnapshot(options: PersistOptions = {}): Promise<PersistResult> {
  const { candlesPerAsset = 50, timeBudgetMs = Number.POSITIVE_INFINITY, timeframes = ["4h", "1d"] } = options;
  const result: PersistResult = { snapshots: 0, candles: 0, indicators: 0, skippedByBudget: false, errors: 0 };
  const prisma = getPrisma();
  if (!prisma) return result;
  const started = Date.now();

  let assets = await prisma.asset.findMany({ where: { active: true } });
  if (assets.length === 0) {
    // garante o universo mesmo sem seed
    await prisma.asset.createMany({
      data: ASSETS.map((a) => ({ symbol: a.symbol, name: a.name, binancePair: a.binancePair, krakenPair: a.krakenPair, coingeckoId: a.coingeckoId, sortOrder: a.sortOrder })),
      skipDuplicates: true,
    });
    assets = await prisma.asset.findMany({ where: { active: true } });
  }
  const byS = new Map(assets.map((a) => [a.symbol, a.id]));

  const { tickers } = await getTickers();
  const snap = await prisma.marketSnapshot.createMany({
    data: tickers.flatMap((t) => {
      const assetId = byS.get(t.symbol);
      if (!assetId) return [];
      return [{ assetId, price: t.price, changePct24h: t.changePct24h, high24h: t.high24h, low24h: t.low24h, volume24h: t.volume24h, quoteVolume24h: t.quoteVolume24h, source: t.source }];
    }),
  });
  result.snapshots = snap.count;

  outer: for (const tf of timeframes) {
    for (const a of ASSETS) {
      if (Date.now() - started > timeBudgetMs) {
        result.skippedByBudget = true;
        break outer;
      }
      const assetId = byS.get(a.symbol);
      if (!assetId) continue;
      try {
        const series = await getCandles(a.symbol, tf, { limit: 300 });
        const recent = series.candles.slice(-candlesPerAsset);
        await prisma.$transaction(
          recent.map((c) =>
            prisma.candle.upsert({
              where: { assetId_timeframe_openTime: { assetId, timeframe: tf, openTime: new Date(c.openTime) } },
              update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, closeTime: new Date(c.closeTime), source: series.source },
              create: { assetId, timeframe: tf, openTime: new Date(c.openTime), closeTime: new Date(c.closeTime), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, source: series.source },
            }),
          ),
        );
        result.candles += recent.length;
        const s = computeSnapshot(series.candles);
        const values: Record<string, unknown> = {
          ema8: s.ema8,
          ema25: s.ema25,
          ema100: s.ema100,
          ema200: s.ema200,
          rsi14: s.rsi14,
          macd: s.macd,
          bb20: s.bollinger,
          atr14: s.atr14,
          stochrsi: s.stochRsi,
          trend: { trend: s.trend, strength: s.trendStrength },
          levels: { supports: s.supports, resistances: s.resistances },
        };
        await prisma.$transaction(
          Object.entries(values).map(([name, value]) =>
            prisma.indicator.upsert({
              where: { assetId_timeframe_name: { assetId, timeframe: tf, name } },
              update: { value: JSON.parse(JSON.stringify(value, jsonSafe)) as Prisma.InputJsonValue, computedAt: new Date() },
              create: { assetId, timeframe: tf, name, value: JSON.parse(JSON.stringify(value, jsonSafe)) as Prisma.InputJsonValue },
            }),
          ),
        );
        result.indicators += Object.keys(values).length;
      } catch (err) {
        result.errors++;
        log.warn("persistência de candles falhou", { symbol: a.symbol, tf, error: (err as Error).message });
      }
    }
  }
  // Retenção: snapshots com mais de 7 dias
  await prisma.marketSnapshot.deleteMany({ where: { collectedAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } });
  return result;
}
