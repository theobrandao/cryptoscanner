import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { ASSETS } from "@/lib/assets";
import { getEnv } from "@/lib/env";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { createLogger } from "@/lib/logger";
import { evaluateAlerts } from "@/services/alert-service";
import { jsonSafe } from "@/services/analysis-service";
import { getCandles, getTickers } from "@/services/market/market-service";
import { runScan } from "@/services/scanner-service";
import { runAllActiveAgents } from "@/services/user-agent-service";
import type { Timeframe } from "@/types/market";

const log = createLogger("scheduler");

/**
 * Ciclo periódico (padrão 5 min, como a verificação server-side citada pela referência):
 *  1. scan de padrões + volume em 4h e 1d (aquece o cache e persiste ScannerResult)
 *  2. snapshots de mercado, candles e indicadores no banco (quando há DATABASE_URL)
 *  3. agentes do usuário
 *  4. alertas do usuário
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    const seconds = getEnv().WORKER_CYCLE_SECONDS;
    log.info("scheduler iniciado", { cycleSeconds: seconds });
    void this.cycle();
    this.timer = setInterval(() => void this.cycle(), seconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async cycle() {
    if (this.running) {
      log.warn("ciclo anterior ainda em execução; pulando");
      return;
    }
    this.running = true;
    const t0 = Date.now();
    try {
      await this.step("scan", async () => {
        for (const tf of ["4h", "1d"] as Timeframe[]) {
          const r = await runScan({ timeframe: tf, includeVolume: tf === "4h", refresh: true });
          log.info("scan concluído", { tf, rows: r.rows.length, patterns: r.rows.reduce((s, x) => s + x.patterns.length, 0), volumeAlerts: r.volumeAlerts.length, sources: r.sources });
        }
      });
      await this.step("persist-market", () => this.persistMarket());
      await this.step("user-agents", async () => {
        const res = await runAllActiveAgents();
        log.info("agentes executados", { agents: res.length, signals: res.reduce((s, r) => s + r.signals.length, 0) });
      });
      await this.step("alerts", async () => {
        const res = await evaluateAlerts();
        log.info("alertas avaliados", res);
      });
    } finally {
      this.running = false;
      log.info("ciclo finalizado", { ms: Date.now() - t0 });
    }
  }

  private async step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      log.error(`etapa ${name} falhou`, { error: (err as Error).message });
    }
  }

  private async persistMarket(): Promise<void> {
    const prisma = getPrisma();
    if (!prisma) return;
    const assets = await prisma.asset.findMany({ where: { active: true } });
    if (assets.length === 0) {
      // garante o universo mesmo sem seed
      await prisma.asset.createMany({
        data: ASSETS.map((a) => ({ symbol: a.symbol, name: a.name, binancePair: a.binancePair, krakenPair: a.krakenPair, coingeckoId: a.coingeckoId, sortOrder: a.sortOrder })),
        skipDuplicates: true,
      });
      return this.persistMarket();
    }
    const byS = new Map(assets.map((a) => [a.symbol, a.id]));
    const { tickers } = await getTickers();
    await prisma.marketSnapshot.createMany({
      data: tickers.flatMap((t) => {
        const assetId = byS.get(t.symbol);
        if (!assetId) return [];
        return [{ assetId, price: t.price, changePct24h: t.changePct24h, high24h: t.high24h, low24h: t.low24h, volume24h: t.volume24h, quoteVolume24h: t.quoteVolume24h, source: t.source }];
      }),
    });
    for (const tf of ["4h", "1d"] as Timeframe[]) {
      for (const a of ASSETS) {
        const assetId = byS.get(a.symbol);
        if (!assetId) continue;
        try {
          const series = await getCandles(a.symbol, tf, { limit: 300 });
          const recent = series.candles.slice(-50);
          await prisma.$transaction(
            recent.map((c) =>
              prisma.candle.upsert({
                where: { assetId_timeframe_openTime: { assetId, timeframe: tf, openTime: new Date(c.openTime) } },
                update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, closeTime: new Date(c.closeTime), source: series.source },
                create: {
                  assetId,
                  timeframe: tf,
                  openTime: new Date(c.openTime),
                  closeTime: new Date(c.closeTime),
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close,
                  volume: c.volume,
                  source: series.source,
                },
              }),
            ),
          );
          const snap = computeSnapshot(series.candles);
          const values: Record<string, unknown> = {
            ema8: snap.ema8,
            ema25: snap.ema25,
            ema100: snap.ema100,
            ema200: snap.ema200,
            rsi14: snap.rsi14,
            macd: snap.macd,
            bb20: snap.bollinger,
            atr14: snap.atr14,
            stochrsi: snap.stochRsi,
            trend: { trend: snap.trend, strength: snap.trendStrength },
            levels: { supports: snap.supports, resistances: snap.resistances },
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
        } catch (err) {
          log.warn("persistência de candles falhou", { symbol: a.symbol, tf, error: (err as Error).message });
        }
      }
    }
    // Retenção: snapshots com mais de 7 dias
    await prisma.marketSnapshot.deleteMany({ where: { collectedAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } });
  }
}
