import { getAsset, ASSETS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { analyzeStructure, EXTERNAL, INTERNAL, swingSequence, type StructureResult } from "@/lib/engines/structure";
import { buildLiquidityMap, type LiquidityMap, type LiquidityPool } from "@/lib/engines/liquidity";
import { analyzeMtf, MTF_ORDER, type MtfResult, type MtfTimeframe } from "@/lib/engines/mtf";
import { computeTechnicals, type Technicals } from "@/lib/engines/technicals";
import { buildSetupGeometry, evaluateSetup, type SetupEvaluation } from "@/lib/engines/setup";
import { computeConfluence, type ConfluenceResult } from "@/lib/engines/confluence";
import { classifyRegime, type RegimeResult } from "@/lib/engines/regime";
import { supportResistance, type SrMap } from "@/lib/engines/levels";
import { backtestSetup } from "@/lib/engines/setup-backtest";
import { computeMetrics } from "@/lib/patterns/backtest";
import { wilsonInterval } from "@/lib/patterns/backtest";
import type { DataQuality } from "@/lib/engines/quality";
import { getCandles } from "@/services/market/market-service";
import { createLimiter } from "@/services/market/providers/types";
import { getSeriesWithFallback, getVenueDerivatives, getVenueTicker, INSTRUMENT_LABEL, VENUE_LABEL, type Instrument, type Venue, type VenueDerivatives } from "@/services/market/venues";
import type { Candle, Direction, Timeframe } from "@/types/market";

const log = createLogger("market-context");

/** Classe de cada dado exibido (contrato comercial: todo número tem origem conhecida). */
export type DataClass = "OBSERVED" | "DERIVED" | "ESTIMATED" | "AI_INTERPRETATION";

export interface Stamp {
  source: string;
  class: DataClass;
  timestamp: number | null;
  stale?: boolean;
}

export interface Zone {
  low: number;
  high: number;
  kind: string;
  state: LiquidityPool["state"];
  distanceAtr: number;
}

export interface HistoricalBlock {
  scope: "symbol" | "universe";
  setup: "structure_pullback";
  samples: number;
  hitRate: number | null;
  hitRateCi: { low: number; high: number } | null;
  hit1R: number | null;
  hit2R: number | null;
  hit3R: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  tp2HitRate: number | null;
  avgR: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  profitable: number;
  regime: { bull: number | null; bear: number | null; range: number | null };
  fromTime: number;
  toTime: number;
  minSample: number;
  smallSample: boolean;
  method: string;
  /** base de dados do backtest (referência fixa, independente da exchange selecionada) */
  dataSource: string;
}

export interface MarketContext {
  symbol: string;
  pair: string;
  name: string;
  /** exchange pedida pelo usuário */
  exchange: Venue;
  /** exchange que efetivamente forneceu os candles (≠ exchange quando houve fallback) */
  dataVenue: Venue;
  instrument: Instrument;
  timeframe: Timeframe;
  /** chave do contexto global: exchange:instrumento:ativo:timeframe (cliente descarta respostas de outra chave) */
  contextKey: string;
  generatedAt: number;
  quality: DataQuality | null;
  ticker: {
    price: number;
    changePct24h: number;
    high24h: number;
    low24h: number;
    quoteVolume24h: number;
    stamp: Stamp;
  } | null;
  regime: RegimeResult & { stamp: Stamp };
  candles: Candle[];
  forming: Candle | null;
  technicals: Technicals & { stamp: Stamp };
  structure: {
    trend: Direction;
    sequence: string;
    lastBos: { level: number; direction: string; time: number } | null;
    lastChoch: { level: number; direction: string; time: number; type: string } | null;
    phase: "Expansion" | "Pullback" | "Reversal" | "Range";
    external: StructureResult;
    internal: StructureResult;
    stamp: Stamp;
  };
  /** liquidez = pools de stops (EQH/EQL, PDH/PDL, PWH/PWL, swings) */
  liquidity: LiquidityMap & {
    above: Zone | null;
    below: Zone | null;
    zones: Zone[];
    stamp: Stamp;
  };
  /** suporte/resistência = zonas de reação por agrupamento de swings (separado de liquidez) */
  levels: SrMap & { stamp: Stamp };
  mtf: MtfResult & { stamp: Stamp };
  derivatives: (VenueDerivatives & { liquidations24hUsd: null; liquidationsNote: string; stamp: Stamp }) | null;
  /** motivo de derivativos ausentes (erro da venue, ou instrumento spot) */
  derivativesError: string | null;
  setup: (SetupEvaluation & { stamp: Stamp }) | null;
  confluence: ConfluenceResult & { stamp: Stamp };
  historical: HistoricalBlock | null;
}

export const HISTORICAL_MIN_SAMPLE = 30;

export interface ContextOptions {
  exchange?: Venue;
  instrument?: Instrument;
}

export const contextKeyOf = (exchange: Venue, instrument: Instrument, symbol: string, tf: Timeframe) => `${exchange}:${instrument}:${symbol}:${tf}`;

const zoneOf = (p: LiquidityPool, atr: number): Zone => ({
  low: p.price - 0.25 * atr,
  high: p.price + 0.25 * atr,
  kind: p.kind,
  state: p.state,
  distanceAtr: p.distanceAtr,
});

async function closedOrNull(symbol: string, tf: Timeframe, limit: number): Promise<Candle[] | null> {
  try {
    return (await getCandles(symbol, tf, { limit })).candles;
  } catch {
    return null;
  }
}

const SETUP_METHOD =
  "Walk-forward do próprio setup (zona na estrutura + liquidez, gatilho por quebra da estrutura interna), candles fechados, entrada no fechamento do gatilho, stop estrutural, saída no TP1 do setup, horizonte 40 candles, alvo e stop no mesmo candle = stop. Hit 1R/2R/3R medido pela excursão a favor até o stop ou 40 candles (sem sair no TP1). Sem taxas/slippage.";

function historicalFrom(trades: ReturnType<typeof backtestSetup>["trades"], fromTime: number, toTime: number, scope: HistoricalBlock["scope"]): HistoricalBlock {
  const m = computeMetrics(trades);
  const reg = (r: "bull" | "bear" | "range") => computeMetrics(trades.filter((t) => t.regime === r)).expectancyR;
  return {
    scope,
    setup: "structure_pullback",
    samples: m.samples,
    hitRate: m.hitRate,
    hitRateCi: wilsonInterval(m.wins, m.wins + m.losses),
    hit1R: m.hit1R,
    hit2R: m.hit2R,
    hit3R: m.hit3R,
    avgMfeR: m.avgMfeR,
    avgMaeR: m.avgMaeR,
    tp2HitRate: trades.length ? trades.filter((t) => t.tp2Hit).length / trades.length : null,
    avgR: m.avgR,
    expectancyR: m.expectancyR,
    profitFactor: m.profitFactor != null && Number.isFinite(m.profitFactor) ? m.profitFactor : null,
    maxDrawdownR: m.maxDrawdownR,
    profitable: trades.filter((t) => t.r > 0).length,
    regime: { bull: reg("bull"), bear: reg("bear"), range: reg("range") },
    fromTime,
    toTime,
    minSample: HISTORICAL_MIN_SAMPLE,
    smallSample: m.samples < HISTORICAL_MIN_SAMPLE,
    method: SETUP_METHOD,
    dataSource: "Binance spot (candles fechados)",
  };
}

/** Histórico do setup: ativo quando n ≥ 30; senão universo de 30 ativos (com indicação do escopo). Cache 12 h. */
export async function getSetupHistorical(symbol: string, tf: Timeframe): Promise<HistoricalBlock | null> {
  const own = await cached<HistoricalBlock | null>(`setupbt:v3:${symbol}:${tf}`, 12 * 3600, async () => {
    const cs = await closedOrNull(symbol, tf, 600);
    if (!cs || cs.length < 300) return null;
    const r = backtestSetup(cs);
    return historicalFrom(r.trades, r.fromTime, r.toTime, "symbol");
  });
  if (own.value && own.value.samples >= HISTORICAL_MIN_SAMPLE) return own.value;
  const uni = await cached<HistoricalBlock | null>(`setupbt:v3:*:${tf}`, 12 * 3600, async () => {
    const limiter = createLimiter(4, 0);
    const all: ReturnType<typeof backtestSetup>["trades"] = [];
    let from = Infinity;
    let to = 0;
    await Promise.all(
      ASSETS.map((a) =>
        limiter(async () => {
          const cs = await closedOrNull(a.symbol, tf, 600);
          if (!cs || cs.length < 300) return;
          const r = backtestSetup(cs);
          all.push(...r.trades);
          from = Math.min(from, r.fromTime);
          to = Math.max(to, r.toTime);
        }),
      ),
    );
    return all.length ? historicalFrom(all, Number.isFinite(from) ? from : 0, to, "universe") : null;
  });
  return uni.value ?? own.value;
}

function phaseOf(ext: StructureResult, tech: Technicals, n: number): MarketContext["structure"]["phase"] {
  const ev = ext.lastEvent;
  if (ev && (ev.type === "CHoCH" || ev.type === "MSS") && n - 1 - ev.index <= 12) return "Reversal";
  if (ext.trend === "neutral") return "Range";
  const withTrend = ext.trend === "bullish" ? tech.emaScore > 0 : tech.emaScore < 0;
  return withTrend ? "Expansion" : "Pullback";
}

/**
 * Contexto único de mercado para o Dashboard e para o AI Analyst: mesma exchange, mesmo instrumento,
 * mesmo ativo, mesmo timeframe, mesma versão de dados. Tudo calculado sobre candles fechados da venue
 * escolhida (ou da venue de fallback, identificada); campos indisponíveis vêm como null com motivo.
 */
export async function getMarketContext(symbol: string, timeframe: Timeframe, opts: ContextOptions = {}): Promise<MarketContext> {
  const asset = getAsset(symbol);
  if (!asset) throw new Error(`Ativo desconhecido: ${symbol}`);
  const exchange: Venue = opts.exchange ?? "binance";
  const instrument: Instrument = opts.instrument ?? "spot";
  const key = contextKeyOf(exchange, instrument, asset.symbol, timeframe);
  const res = await cached<MarketContext>(`ctx:v2:${key}`, 30, async () => {
    const main = await getSeriesWithFallback(exchange, instrument, asset, timeframe, 400);
    const venue = main.venue;
    const forming = main.forming;
    const cs = main.closed;
    const [ticker, der, historical, ...mtfSeries] = await Promise.all([
      getVenueTicker(venue, instrument, asset).catch(() => null),
      instrument === "perp"
        ? getVenueDerivatives(exchange, asset).then(
            (r) => ({ ...r, error: null as string | null }),
            (err: Error) => ({ value: null, stale: false, error: `${VENUE_LABEL[exchange]} perpétuo: ${err.message}` }),
          )
        : Promise.resolve({ value: null, stale: false, error: "Spot: funding, open interest e liquidações se aplicam a contratos perpétuos." }),
      getSetupHistorical(asset.symbol, timeframe).catch((err) => {
        log.warn("histórico do setup falhou", { symbol, timeframe, error: (err as Error).message });
        return null;
      }),
      ...MTF_ORDER.map((tf) =>
        tf === timeframe
          ? Promise.resolve(cs)
          : getSeriesWithFallback(venue, instrument, asset, tf, 300).then(
              (s) => s.closed,
              () => null,
            ),
      ),
    ]);
    const now = Date.now();
    const lastClosed = cs[cs.length - 1];
    const srcLabel = `${VENUE_LABEL[venue]} ${INSTRUMENT_LABEL[instrument].toLowerCase()}`;
    const derivedStamp: Stamp = { source: `CryptoScanner (candles fechados ${srcLabel})`, class: "DERIVED", timestamp: lastClosed ? lastClosed.closeTime : null };
    const series: Partial<Record<MtfTimeframe, Candle[]>> = {};
    MTF_ORDER.forEach((tf, i) => {
      const s = mtfSeries[i];
      if (s) series[tf] = s;
    });
    const daily = series["1d" as MtfTimeframe]?.slice(-10);
    const weekly = series["1w" as MtfTimeframe]?.slice(-10);
    const external = analyzeStructure(cs, EXTERNAL);
    const internal = analyzeStructure(cs, INTERNAL);
    const allSwings = [...external.swings, ...internal.swings].sort((a, b) => a.index - b.index);
    const liquidity = buildLiquidityMap(cs, allSwings, { daily, weekly });
    const tech = computeTechnicals(cs, { intradayVwap: timeframe !== "1d" && timeframe !== "1w" });
    const mtf = analyzeMtf(series);
    const regime = classifyRegime(external, tech, cs.length);
    const atrV = Number.isFinite(external.atr) ? external.atr : 0;
    const levels = supportResistance(cs, allSwings, atrV);
    const direction: Direction = external.trend !== "neutral" ? external.trend : mtf.alignmentScore >= 40 ? "bullish" : mtf.alignmentScore <= -40 ? "bearish" : "neutral";
    const geometry = direction === "neutral" ? null : buildSetupGeometry(cs, direction, external, internal, liquidity);
    const d = der.value;
    const confluence = computeConfluence({
      direction,
      external,
      mtf,
      liquidity,
      technicals: tech,
      setup: geometry,
      derivatives: d ? { fundingRate: d.fundingRate, openInterestChange24hPct: d.openInterestChange24hPct, priceChange24hPct: ticker?.changePct24h ?? null, longShortRatio: d.longShortRatio } : null,
      historical: historical ? { expectancyR: historical.expectancyR, samples: historical.samples, minSample: HISTORICAL_MIN_SAMPLE } : null,
      dataStatus: main.quality?.status ?? null,
      barsInSeries: cs.length,
    });
    const setup = geometry ? evaluateSetup(cs, geometry, internal, external.trend === direction, confluence.score) : null;
    const lastBos = [...external.events].reverse().find((e) => e.type === "BOS") ?? null;
    const lastChoch = [...external.events].reverse().find((e) => e.type !== "BOS") ?? null;
    const available = liquidity.pools.filter((p) => p.state === "available");
    return {
      symbol: asset.symbol,
      pair: asset.binancePair,
      name: asset.name,
      exchange,
      dataVenue: venue,
      instrument,
      timeframe,
      contextKey: key,
      generatedAt: now,
      quality: main.quality ?? null,
      ticker: ticker
        ? {
            price: ticker.price,
            changePct24h: ticker.changePct24h,
            high24h: ticker.high24h,
            low24h: ticker.low24h,
            quoteVolume24h: ticker.quoteVolume24h,
            stamp: { source: ticker.source, class: "OBSERVED", timestamp: ticker.updatedAt },
          }
        : null,
      regime: { ...regime, stamp: derivedStamp },
      candles: main.candles,
      forming,
      technicals: { ...tech, stamp: derivedStamp },
      structure: {
        trend: external.trend,
        sequence: swingSequence(external.swings),
        lastBos: lastBos ? { level: lastBos.level, direction: lastBos.direction, time: lastBos.time } : null,
        lastChoch: lastChoch ? { level: lastChoch.level, direction: lastChoch.direction, time: lastChoch.time, type: lastChoch.type } : null,
        phase: phaseOf(external, tech, cs.length),
        external,
        internal,
        stamp: derivedStamp,
      },
      liquidity: {
        ...liquidity,
        above: liquidity.nearestAbove ? zoneOf(liquidity.nearestAbove, atrV) : null,
        below: liquidity.nearestBelow ? zoneOf(liquidity.nearestBelow, atrV) : null,
        zones: available.slice(0, 8).map((p) => zoneOf(p, atrV)),
        stamp: derivedStamp,
      },
      levels: { ...levels, stamp: derivedStamp },
      mtf: { ...mtf, stamp: derivedStamp },
      derivatives: d
        ? {
            ...d,
            liquidations24hUsd: null,
            liquidationsNote: "Liquidações agregadas não têm endpoint público gratuito; não exibimos valor estimado.",
            stamp: { source: `${VENUE_LABEL[d.exchange]} USDT perpetual`, class: "OBSERVED", timestamp: d.updatedAt, stale: der.stale },
          }
        : null,
      derivativesError: der.error,
      setup: setup ? { ...setup, stamp: derivedStamp } : null,
      confluence: { ...confluence, stamp: derivedStamp },
      historical,
    };
  });
  return res.value;
}

/** Candles de referência (Binance spot) — usado por serviços que não dependem da venue. */
export const getReferenceCandles = (symbol: string, tf: Timeframe, limit = 300) => getCandles(symbol, tf, { limit });
