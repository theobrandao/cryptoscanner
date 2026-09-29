import { getPrisma } from "@/database/client";
import { ASSETS } from "@/lib/assets";
import { getCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { resolveTrade, summarizeTrades, walkForward, wilsonInterval, type BacktestTrade, type PatternStat } from "@/lib/patterns/backtest";
import { PATTERN_KEYS, type PatternKey } from "@/lib/patterns/catalog";
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
  symbol: string;
  regime: string;
  minSample: number;
  symbols: string[];
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

/** Amostra mínima para exibir uma estatística sem aviso de amostra pequena. */
export const MIN_SAMPLE = 30;

export interface SliceStat extends PatternStat {
  symbol: string; // "*" = todos
  regime: string; // "*" = todos | bull | bear | range
}

interface BacktestCacheValueV2 extends BacktestCacheValue {
  /** recortes por ativo e por regime (inclui o agregado "*"/"*" em `stats`) */
  slices: SliceStat[];
}

function slice(trades: readonly BacktestTrade[], symbol: string, regime: string): SliceStat[] {
  return summarizeTrades(trades).map((st) => ({ ...st, symbol, regime }));
}

/** Executa o backtest de um timeframe para todo o universo de ativos e grava os agregados (total, por ativo, por regime, ativo×regime). */
export async function computeBacktest(tf: StatsTimeframe, options: { symbols?: string[]; timeBudgetMs?: number } = {}): Promise<BacktestCacheValueV2> {
  const started = Date.now();
  const symbols = options.symbols ?? ASSETS.map((a) => a.symbol);
  const budget = options.timeBudgetMs ?? 40_000;
  const limiter = createLimiter(4, 0);
  const bySymbol = new Map<string, BacktestTrade[]>();
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
          bySymbol.set(symbol, walkForward(cs, { horizon: HORIZON_BARS, cooldown: COOLDOWN_BARS, minConfidence: MIN_CONFIDENCE }));
          fromTime = Math.min(fromTime, cs[0]?.openTime ?? fromTime);
          toTime = Math.max(toTime, cs[cs.length - 1]?.openTime ?? toTime);
        } catch (err) {
          log.warn("backtest de ativo falhou", { symbol, tf, error: (err as Error).message });
        }
      }),
    ),
  );
  const assets = bySymbol.size;
  if (assets === 0) throw new Error(`backtest ${tf}: nenhum ativo com histórico suficiente`);
  const trades = [...bySymbol.values()].flat();
  const regimes = ["bull", "bear", "range"] as const;
  const slices: SliceStat[] = [...slice(trades, "*", "*")];
  for (const r of regimes) slices.push(...slice(trades.filter((t) => t.regime === r), "*", r));
  for (const [sym, list] of bySymbol) {
    slices.push(...slice(list, sym, "*"));
    for (const r of regimes) slices.push(...slice(list.filter((t) => t.regime === r), sym, r));
  }
  const value: BacktestCacheValueV2 = {
    timeframe: tf,
    computedAt: Date.now(),
    assets,
    fromTime: Number.isFinite(fromTime) ? fromTime : 0,
    toTime,
    totalTrades: trades.length,
    stats: slices.filter((x) => x.symbol === "*" && x.regime === "*"),
    slices,
  };
  await getCache().set(cacheKey(tf), value, CACHE_TTL);
  const prisma = getPrisma();
  if (prisma) {
    const from = new Date(value.fromTime);
    const to = new Date(value.toTime);
    const finite = (v: number | null) => (v != null && Number.isFinite(v) ? v : null);
    await prisma.$transaction([
      prisma.backtestStat.deleteMany({ where: { timeframe: tf } }),
      prisma.backtestStat.createMany({
        data: slices.map((x) => ({
          timeframe: tf,
          patternKey: x.key,
          symbol: x.symbol,
          regime: x.regime,
          samples: x.samples,
          hitRate: finite(x.hitRate),
          expectancyR: finite(x.expectancyR),
          profitFactor: finite(x.profitFactor),
          metrics: JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v))),
          fromTime: from,
          toTime: to,
        })),
      }),
    ]);
  }
  log.info("backtest concluído", { tf, assets, trades: trades.length, slices: slices.length, ms: Date.now() - started });
  return value;
}

async function loadBacktest(tf: StatsTimeframe): Promise<BacktestCacheValueV2 | null> {
  const hit = await getCache().get<BacktestCacheValueV2>(cacheKey(tf));
  if (hit?.slices) return hit;
  const prisma = getPrisma();
  if (prisma) {
    const rows = await prisma.backtestStat.findMany({ where: { timeframe: tf } });
    if (rows.length) {
      const slices = rows
        .filter((r) => (PATTERN_KEYS as readonly string[]).includes(r.patternKey))
        .map((r) => ({ ...(r.metrics as unknown as SliceStat), symbol: r.symbol, regime: r.regime }));
      const all = slices.filter((x) => x.symbol === "*" && x.regime === "*").sort((a, b) => b.samples - a.samples);
      const first = rows[0]!;
      const value: BacktestCacheValueV2 = {
        timeframe: tf,
        computedAt: Math.max(...rows.map((r) => r.computedAt.getTime())),
        assets: new Set(rows.filter((r) => r.symbol !== "*").map((r) => r.symbol)).size,
        fromTime: first.fromTime.getTime(),
        toTime: first.toTime.getTime(),
        totalTrades: all.reduce((s, r) => s + r.samples, 0),
        stats: all,
        slices,
      };
      await getCache().set(cacheKey(tf), value, CACHE_TTL);
      return value;
    }
  }
  return null;
}

export interface EdgeLookup {
  stat: SliceStat;
  /** granularidade usada: ativo×regime → ativo → regime → todos */
  scope: "symbol+regime" | "symbol" | "regime" | "all";
  smallSample: boolean;
}

/**
 * Historical edge de um padrão: usa o recorte mais específico com n ≥ MIN_SAMPLE
 * (ativo×regime → ativo → regime → todos). Nunca inventa: sem backtest, retorna null.
 */
export async function getHistoricalEdge(tf: Timeframe, key: PatternKey, symbol?: string, regime?: string): Promise<EdgeLookup | null> {
  if (!(STATS_TIMEFRAMES as readonly string[]).includes(tf)) return null;
  const bt = await loadBacktest(tf as StatsTimeframe);
  if (!bt) return null;
  const find = (sym: string, reg: string) => bt.slices.find((x) => x.key === key && x.symbol === sym && x.regime === reg);
  const candidates: Array<[EdgeLookup["scope"], SliceStat | undefined]> = [
    ["symbol+regime", symbol && regime ? find(symbol, regime) : undefined],
    ["symbol", symbol ? find(symbol, "*") : undefined],
    ["regime", regime ? find("*", regime) : undefined],
    ["all", find("*", "*")],
  ];
  for (const [scope, st] of candidates) if (st && st.samples >= MIN_SAMPLE) return { stat: st, scope, smallSample: false };
  const any = candidates.find(([, st]) => st)?.[1];
  const scope = candidates.find(([, st]) => st)?.[0] ?? "all";
  return any ? { stat: any, scope, smallSample: true } : null;
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
export async function getPatternStats(tf: StatsTimeframe, filter: { symbol?: string; regime?: string } = {}): Promise<PatternStatsReport> {
  const bt = (await loadBacktest(tf)) ?? (await computeBacktest(tf));
  const live = await liveStats(tf);
  const symbol = filter.symbol ?? "*";
  const regime = filter.regime ?? "*";
  const chosen = bt.slices.filter((x) => x.symbol === symbol && x.regime === regime).sort((a, b) => b.samples - a.samples);
  const rows: PatternStatRow[] = chosen.map((s) => ({ ...s, ci: wilsonInterval(s.wins, s.wins + s.losses), live: symbol === "*" && regime === "*" ? (live.get(s.key) ?? null) : null }));
  return {
    symbol,
    regime,
    minSample: MIN_SAMPLE,
    symbols: [...new Set(bt.slices.map((x) => x.symbol).filter((x) => x !== "*"))].sort(),
    timeframe: tf,
    computedAt: bt.computedAt,
    assets: bt.assets,
    fromTime: bt.fromTime,
    toTime: bt.toTime,
    totalTrades: chosen.reduce((sum, r) => sum + r.samples, 0),
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
        // entrada = fechamento do último candle fechado (mesma régua do backtest)
        const entry = p.price;
        if (long ? !(p.target > entry && p.stop < entry) : !(p.target < entry && p.stop > entry)) continue;
        const recent = await prisma.patternSignal.findFirst({
          where: { symbol: row.symbol, timeframe: tf, patternKey: p.key, detectedAt: { gte: new Date(Date.now() - cooldownMs) } },
          select: { id: true },
        });
        if (recent) continue;
        await prisma.patternSignal.create({
          data: { symbol: row.symbol, timeframe: tf, patternKey: p.key, direction: p.direction, confidence: p.confidence, entry, target: p.target, stop: p.stop, candleTime: new Date(row.candleTime) },
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
