import { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { ASSETS } from "@/lib/assets";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { createLogger } from "@/lib/logger";
import { jsonSafe } from "@/services/analysis-service";
import { getCandles, getTickers } from "@/services/market/market-service";
import { createLimiter } from "@/services/market/providers/types";
import type { Candle, Timeframe } from "@/types/market";

const log = createLogger("persist");

export interface PersistOptions {
  /** candles recentes gravados por ativo/timeframe (upsert) */
  candlesPerAsset?: number;
  /** orçamento de tempo; ao estourar, o restante fica para o próximo ciclo */
  timeBudgetMs?: number;
  timeframes?: Timeframe[];
  /** requisições simultâneas ao provedor de candles */
  concurrency?: number;
}

export interface PersistResult {
  snapshots: number;
  candles: number;
  indicators: number;
  skippedByBudget: boolean;
  errors: number;
}

/** Linhas por INSERT em lote (≈ 10 parâmetros por linha; limite do Postgres é 65 535). */
const CHUNK = 500;

interface CandleRow {
  assetId: string;
  timeframe: Timeframe;
  candle: Candle;
  source: string;
}

interface IndicatorRow {
  assetId: string;
  timeframe: Timeframe;
  name: string;
  value: string; // JSON serializado
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Upsert em lote de candles: 1 comando SQL por até 500 linhas em vez de 1 upsert por candle.
 * Relevante em hospedagem serverless com banco remoto (cada ida e volta custa dezenas/centenas de ms).
 */
async function upsertCandles(prisma: NonNullable<ReturnType<typeof getPrisma>>, rows: CandleRow[]): Promise<number> {
  let written = 0;
  for (const part of chunk(rows, CHUNK)) {
    const values = part.map(
      (r) =>
        Prisma.sql`(gen_random_uuid()::text, ${r.assetId}, ${r.timeframe}, ${new Date(r.candle.openTime)}, ${new Date(r.candle.closeTime)}, ${r.candle.open}, ${r.candle.high}, ${r.candle.low}, ${r.candle.close}, ${r.candle.volume}, ${r.source})`,
    );
    written += await prisma.$executeRaw`
      INSERT INTO "Candle" ("id", "assetId", "timeframe", "openTime", "closeTime", "open", "high", "low", "close", "volume", "source")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("assetId", "timeframe", "openTime") DO UPDATE SET
        "closeTime" = EXCLUDED."closeTime",
        "open" = EXCLUDED."open",
        "high" = EXCLUDED."high",
        "low" = EXCLUDED."low",
        "close" = EXCLUDED."close",
        "volume" = EXCLUDED."volume",
        "source" = EXCLUDED."source"`;
  }
  return written;
}

/** Upsert em lote dos indicadores materializados (1 comando por até 500 linhas). */
async function upsertIndicators(prisma: NonNullable<ReturnType<typeof getPrisma>>, rows: IndicatorRow[]): Promise<number> {
  let written = 0;
  for (const part of chunk(rows, CHUNK)) {
    const values = part.map((r) => Prisma.sql`(gen_random_uuid()::text, ${r.assetId}, ${r.timeframe}, ${r.name}, ${r.value}::jsonb, CURRENT_TIMESTAMP)`);
    written += await prisma.$executeRaw`
      INSERT INTO "Indicator" ("id", "assetId", "timeframe", "name", "value", "computedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("assetId", "timeframe", "name") DO UPDATE SET
        "value" = EXCLUDED."value",
        "computedAt" = EXCLUDED."computedAt"`;
  }
  return written;
}

/**
 * Persistência de mercado compartilhada pelo worker (processo longo) e pelo endpoint de cron
 * (serverless): snapshots de ticker, candles recentes e indicadores materializados.
 *
 * Por timeframe: busca as séries de todos os ativos em paralelo (limitador) e grava com dois
 * comandos em lote (candles e indicadores), em vez de dezenas de upserts por ativo.
 */
export async function persistMarketSnapshot(options: PersistOptions = {}): Promise<PersistResult> {
  const { candlesPerAsset = 50, timeBudgetMs = Number.POSITIVE_INFINITY, timeframes = ["4h", "1d"], concurrency = 4 } = options;
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

  const limiter = createLimiter(concurrency, 0);
  for (const tf of timeframes) {
    if (Date.now() - started > timeBudgetMs) {
      result.skippedByBudget = true;
      break;
    }
    const candleRows: CandleRow[] = [];
    const indicatorRows: IndicatorRow[] = [];
    await Promise.all(
      ASSETS.map((a) =>
        limiter(async () => {
          const assetId = byS.get(a.symbol);
          if (!assetId) return;
          try {
            const series = await getCandles(a.symbol, tf, { limit: 300 });
            for (const candle of series.candles.slice(-candlesPerAsset)) candleRows.push({ assetId, timeframe: tf, candle, source: series.source });
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
            for (const [name, value] of Object.entries(values)) indicatorRows.push({ assetId, timeframe: tf, name, value: JSON.stringify(value, jsonSafe) });
          } catch (err) {
            result.errors++;
            log.warn("coleta de candles para persistência falhou", { symbol: a.symbol, tf, error: (err as Error).message });
          }
        }),
      ),
    );
    try {
      if (candleRows.length > 0) result.candles += await upsertCandles(prisma, candleRows);
      if (indicatorRows.length > 0) result.indicators += await upsertIndicators(prisma, indicatorRows);
    } catch (err) {
      result.errors++;
      log.warn("persistência em lote falhou", { tf, error: (err as Error).message });
    }
  }
  // Retenção: snapshots com mais de 7 dias
  await prisma.marketSnapshot.deleteMany({ where: { collectedAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } });
  return result;
}
