import { getPrisma } from "@/database/client";
import { ASSETS } from "@/lib/assets";
import { getCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { resolveTrade, summarizeTrades, walkForward, wilsonInterval, type BacktestTrade, type PatternStat } from "@/lib/patterns/backtest";
import { PATTERN_CATALOG, PATTERN_KEYS, type PatternKey } from "@/lib/patterns/catalog";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import { getCandles } from "@/services/market/market-service";
import { createLimiter } from "@/services/market/providers/types";
import type { ScanResult } from "@/services/scanner-service";
import type { Direction, Timeframe } from "@/types/market";

const log = createLogger("pattern-stats");

export const STATS_TIMEFRAMES = ["4h", "1d"] as const satisfies readonly Timeframe[];
export type StatsTimeframe = (typeof STATS_TIMEFRAMES)[number];

/** Parâmetros compartilhados pelo backtest e pelo acompanhamento ao vivo (mesma régua). */
export const HORIZON_BARS = 40;
export const COOLDOWN_BARS = 12;
export const MIN_CONFIDENCE = 60;

const CACHE_TTL = 26 * 3600;
const cacheKey = (tf: StatsTimeframe) => `patternstats:v1:${tf}`;

export interface LiveStat {
  key: PatternKey;
  open: number;
  wins: number;
  losses: number;
  expired: number;
  hitRate: number | null;
  avgReturnPct: number | null;
}

export interface PatternStatRow extends PatternStat {
  /** intervalo de confiança de Wilson 95% da taxa de acerto (backtest) */
  ci: { low: number; high: number } | null;
  live: LiveStat | null;
}

export interface PatternStatsReport {
  timeframe: StatsTimeframe;
  computedAt: number;
  assets: number;
  fromTime: number;
  toTime: number;
  totalTrades: number;
  params: { horizonBars: number; cooldownBars: number; minConfidence: number; lookback: number };
  rows: PatternStatRow[];
  method: string;
}

interface BacktestCacheValue {
  timeframe: StatsTimeframe;
  computedAt: number;
  assets: number;
  fromTime: number;
  toTime: number;
  totalTrades: number;
  stats: PatternStat[];
}

export const METHOD_NOTE =
  "Walk-forward sem olhar o futuro: em cada candle a detecção vê só o passado; entrada no fechamento, alvo e stop do próprio padrão, " +
  `até ${HORIZON_BARS} candles. Alvo e stop no mesmo candle contam como stop. Taxa de acerto = alvos / (alvos + stops); expiradas ficam fora da taxa e entram no retorno médio. ` +
  "Sem custos de corretagem/slippage. Resultado passado não garante resultado futuro.";

/** Executa o backtest de um timeframe para todo o universo de ativos e grava o agregado. */
export async function computeBacktest(tf: StatsTimeframe, options: { symbols?: string[]; timeBudgetMs?: number } = {}): Promise<BacktestCacheValue> {
  const started = Date.now();
  const symbols = options.symbols ?? ASSETS.map((a) => a.symbol);
  const budget = options.timeBudgetMs ?? 40_000;
  const limiter = createLimiter(4, 0);
  const trades: BacktestTrade[] = [];
  let assets = 0;
  let fromTime = Number.POSITIVE_INFINITY;
  let toTime = 0;
  await Promise.all(
    symbols.map((symbol) =>
      limiter(async () => {
        if (Date.now() - started > budget) return;
        try {
          const series = await getCandles(symbol, tf, { limit: 600 });
          const cs = series.candles;
          if (cs.length < 250) return;
          trades.push(...walkForward(cs, { horizon: HORIZON_BARS, cooldown: COOLDOWN_BARS, minConfidence: MIN_CONFIDENCE }));
          assets++;
          fromTime = Math.min(fromTime, cs[0]?.openTime ?? fromTime);
          toTime = Math.max(toTime, cs[cs.length - 1]?.openTime ?? toTime);
        } catch (err) {
          log.warn("backtest de ativo falhou", { symbol, tf, error: (err as Error).message });
        }
      }),
    ),
  );
  const value: BacktestCacheValue = {
    timeframe: tf,
    computedAt: Date.now(),
    assets,
    fromTime: Number.isFinite(fromTime) ? fromTime : 0,
    toTime,
    totalTrades: trades.length,
    stats: summarizeTrades(trades),
  };
  if (assets === 0) throw new Error(`backtest ${tf}: nenhum ativo com histórico suficiente`);
  await getCache().set(cacheKey(tf), value, CACHE_TTL);
  const prisma = getPrisma();
  if (prisma) {
    await prisma.$transaction(
      value.stats.map((s) =>
        prisma.patternStat.upsert({
          where: { timeframe_patternKey: { timeframe: tf, patternKey: s.key } },
          create: { timeframe: tf, patternKey: s.key, samples: s.samples, wins: s.wins, losses: s.losses, expired: s.expired, hitRate: s.hitRate, avgReturnPct: s.avgReturnPct, avgBars: s.avgBars, assets, fromTime: new Date(value.fromTime), toTime: new Date(value.toTime) },
          update: { samples: s.samples, wins: s.wins, losses: s.losses, expired: s.expired, hitRate: s.hitRate, avgReturnPct: s.avgReturnPct, avgBars: s.avgBars, assets, fromTime: new Date(value.fromTime), toTime: new Date(value.toTime), computedAt: new Date() },
        }),
      ),
    );
  }
  log.info("backtest concluído", { tf, assets, trades: trades.length, ms: Date.now() - started });
  return value;
}

async function loadBacktest(tf: StatsTimeframe): Promise<BacktestCacheValue | null> {
  const hit = await getCache().get<BacktestCacheValue>(cacheKey(tf));
  if (hit) return hit;
  const prisma = getPrisma();
  if (prisma) {
    const rows = await prisma.patternStat.findMany({ where: { timeframe: tf } });
    if (rows.length) {
      const first = rows[0]!;
      const value: BacktestCacheValue = {
        timeframe: tf,
        computedAt: Math.max(...rows.map((r) => r.computedAt.getTime())),
        assets: first.assets,
        fromTime: first.fromTime.getTime(),
        toTime: first.toTime.getTime(),
        totalTrades: rows.reduce((s, r) => s + r.samples, 0),
        stats: rows
          .filter((r): r is typeof r & { patternKey: PatternKey } => (PATTERN_KEYS as readonly string[]).includes(r.patternKey))
          .map((r) => ({
            key: r.patternKey,
            label: PATTERN_CATALOG[r.patternKey].label,
            direction: PATTERN_CATALOG[r.patternKey].direction,
            samples: r.samples,
            wins: r.wins,
            losses: r.losses,
            expired: r.expired,
            hitRate: r.hitRate,
            avgReturnPct: r.avgReturnPct,
            avgBars: r.avgBars,
          }))
          .sort((a, b) => b.samples - a.samples),
      };
      await getCache().set(cacheKey(tf), value, CACHE_TTL);
      return value;
    }
  }
  return null;
}

async function liveStats(tf: StatsTimeframe): Promise<Map<PatternKey, LiveStat>> {
  const out = new Map<PatternKey, LiveStat>();
  const prisma = getPrisma();
  if (!prisma) return out;
  const groups = await prisma.patternSignal.groupBy({ by: ["patternKey", "status"], where: { timeframe: tf }, _count: { _all: true }, _avg: { returnPct: true } });
  for (const g of groups) {
    if (!(PATTERN_KEYS as readonly string[]).includes(g.patternKey)) continue;
    const key = g.patternKey as PatternKey;
    const cur = out.get(key) ?? { key, open: 0, wins: 0, losses: 0, expired: 0, hitRate: null, avgReturnPct: null };
    const n = g._count._all;
    if (g.status === "open") cur.open += n;
    else if (g.status === "win") cur.wins += n;
    else if (g.status === "loss") cur.losses += n;
    else if (g.status === "expired") cur.expired += n;
    if (g.status !== "open" && g._avg.returnPct != null) {
      const closedBefore = cur.wins + cur.losses + cur.expired - n;
      cur.avgReturnPct = ((cur.avgReturnPct ?? 0) * closedBefore + g._avg.returnPct * n) / (closedBefore + n);
    }
    out.set(key, cur);
  }
  for (const s of out.values()) s.hitRate = s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : null;
  return out;
}

/** Relatório para a página /estatisticas e para os cartões do scanner. Calcula na hora se não houver agregado. */
export async function getPatternStats(tf: StatsTimeframe): Promise<PatternStatsReport> {
  const bt = (await loadBacktest(tf)) ?? (await computeBacktest(tf));
  const live = await liveStats(tf);
  const rows: PatternStatRow[] = bt.stats.map((s) => ({ ...s, ci: wilsonInterval(s.wins, s.wins + s.losses), live: live.get(s.key) ?? null }));
  return {
    timeframe: tf,
    computedAt: bt.computedAt,
    assets: bt.assets,
    fromTime: bt.fromTime,
    toTime: bt.toTime,
    totalTrades: bt.totalTrades,
    params: { horizonBars: HORIZON_BARS, cooldownBars: COOLDOWN_BARS, minConfidence: MIN_CONFIDENCE, lookback: 160 },
    rows,
    method: METHOD_NOTE,
  };
}

/**
 * Acompanhamento ao vivo: registra os padrões detectados no ciclo e resolve os abertos com os
 * candles seguintes (mesma régua do backtest: alvo/stop do padrão, horizonte de 40 candles).
 */
export async function trackLiveSignals(scans: readonly ScanResult[]): Promise<{ created: number; resolved: number; open: number }> {
  const prisma = getPrisma();
  if (!prisma) return { created: 0, resolved: 0, open: 0 };
  let created = 0;
  for (const scan of scans) {
    const tf = scan.timeframe;
    if (!(STATS_TIMEFRAMES as readonly string[]).includes(tf)) continue;
    const cooldownMs = COOLDOWN_BARS * TIMEFRAME_MS[tf];
    for (const row of scan.rows) {
      for (const p of row.patterns) {
        if (p.direction === "neutral" || p.target == null || p.stop == null || p.confidence < MIN_CONFIDENCE) continue;
        const long = p.direction === "bullish";
        if (long ? !(p.target > row.price && p.stop < row.price) : !(p.target < row.price && p.stop > row.price)) continue;
        const recent = await prisma.patternSignal.findFirst({
          where: { symbol: row.symbol, timeframe: tf, patternKey: p.key, detectedAt: { gte: new Date(Date.now() - cooldownMs) } },
          select: { id: true },
        });
        if (recent) continue;
        await prisma.patternSignal.create({
          data: { symbol: row.symbol, timeframe: tf, patternKey: p.key, direction: p.direction, confidence: p.confidence, entry: row.price, target: p.target, stop: p.stop, candleTime: new Date(row.candleTime) },
        });
        created++;
      }
    }
  }

  const open = await prisma.patternSignal.findMany({ where: { status: "open" }, orderBy: { detectedAt: "asc" }, take: 500 });
  let resolved = 0;
  const bySeries = new Map<string, typeof open>();
  for (const s of open) bySeries.set(`${s.symbol}|${s.timeframe}`, [...(bySeries.get(`${s.symbol}|${s.timeframe}`) ?? []), s]);
  for (const [k, list] of bySeries) {
    const [symbol, tf] = k.split("|") as [string, Timeframe];
    let candles;
    try {
      candles = (await getCandles(symbol, tf, { limit: 600 })).candles;
    } catch {
      continue;
    }
    for (const s of list) {
      const idx = candles.findIndex((c) => c.openTime === s.candleTime.getTime());
      let status: "win" | "loss" | "expired" | null = null;
      let exit: number | null = null;
      if (idx === -1) {
        // candle de entrada saiu da janela: expira pelo último fechamento conhecido
        if (Date.now() - s.candleTime.getTime() > HORIZON_BARS * TIMEFRAME_MS[tf]) {
          status = "expired";
          exit = candles[candles.length - 1]?.close ?? s.entry;
        }
      } else {
        const r = resolveTrade(candles, idx, s.direction as Direction, s.entry, s.target, s.stop, HORIZON_BARS);
        const horizonComplete = idx + HORIZON_BARS <= candles.length - 1;
        if (r.outcome !== "expired" || horizonComplete) {
          status = r.outcome;
          exit = r.exit;
        }
      }
      if (!status || exit == null) continue;
      const raw = (exit - s.entry) / s.entry;
      await prisma.patternSignal.update({
        where: { id: s.id },
        data: { status, exitPrice: exit, resolvedAt: new Date(), returnPct: (s.direction === "bullish" ? raw : -raw) * 100 },
      });
      resolved++;
    }
  }
  const stillOpen = await prisma.patternSignal.count({ where: { status: "open" } });
  return { created, resolved, open: stillOpen };
}

/** Mapa compacto para os cartões do scanner: key → taxa de acerto do backtest e n. */
export async function getHitRateMap(tf: Timeframe): Promise<Record<string, { hitRate: number | null; n: number }> | null> {
  if (!(STATS_TIMEFRAMES as readonly string[]).includes(tf)) return null;
  const bt = await loadBacktest(tf as StatsTimeframe);
  if (!bt) return null;
  return Object.fromEntries(bt.stats.map((s) => [s.key, { hitRate: s.hitRate, n: s.wins + s.losses }]));
}
