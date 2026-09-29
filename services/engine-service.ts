import { getAsset } from "@/lib/assets";
import { cached } from "@/lib/cache";
import type { DataQuality } from "@/lib/engines/quality";
import { analyzeStructure, EXTERNAL, INTERNAL, swingSequence, type StructureResult } from "@/lib/engines/structure";
import { buildLiquidityMap, type LiquidityMap } from "@/lib/engines/liquidity";
import { analyzeMtf, MTF_ORDER, type MtfResult, type MtfTimeframe } from "@/lib/engines/mtf";
import { getCandles, getTicker } from "@/services/market/market-service";
import type { Candle, Timeframe } from "@/types/market";

export interface StructureView extends Omit<StructureResult, "swings" | "events" | "failed"> {
  swings: StructureResult["swings"];
  events: StructureResult["events"];
  failed: StructureResult["failed"];
  sequence: string;
}

export interface EngineReport {
  symbol: string;
  timeframe: Timeframe;
  generatedAt: number;
  price: number | null;
  lastClosed: { openTime: number; close: number } | null;
  quality: DataQuality | null;
  structure: { external: StructureView; internal: StructureView };
  liquidity: LiquidityMap;
  mtf: MtfResult;
  /** candles fechados usados (para o gráfico desenhar swings e níveis nas mesmas barras) */
  candles: Candle[];
}

const view = (r: StructureResult): StructureView => ({ ...r, sequence: swingSequence(r.swings) });

async function closed(symbol: string, tf: Timeframe, limit = 300): Promise<Candle[] | null> {
  try {
    return (await getCandles(symbol, tf, { limit })).candles;
  } catch {
    return null;
  }
}

/**
 * Relatório determinístico por ativo e timeframe: estrutura (externa e interna), mapa de liquidez e
 * matriz multi-timeframe. Somente candles fechados. Cache de 60 s.
 */
export async function getEngineReport(symbol: string, timeframe: Timeframe): Promise<EngineReport> {
  const asset = getAsset(symbol);
  if (!asset) throw new Error(`Ativo desconhecido: ${symbol}`);
  const res = await cached<EngineReport>(`engine:v1:${asset.symbol}:${timeframe}`, 60, async () => {
    const main = await getCandles(asset.symbol, timeframe, { limit: 300 });
    const cs = main.candles;
    const [daily, weekly, ticker, ...mtfSeries] = await Promise.all([
      closed(asset.symbol, "1d", 10),
      closed(asset.symbol, "1w", 10),
      getTicker(asset.symbol).catch(() => undefined),
      ...MTF_ORDER.map((tf) => (tf === timeframe ? Promise.resolve(cs) : closed(asset.symbol, tf, 300))),
    ]);
    const external = analyzeStructure(cs, EXTERNAL);
    const internal = analyzeStructure(cs, INTERNAL);
    const liquidity = buildLiquidityMap(cs, [...external.swings, ...internal.swings].sort((a, b) => a.index - b.index), {
      daily: daily ?? undefined,
      weekly: weekly ?? undefined,
    });
    const series: Partial<Record<MtfTimeframe, Candle[]>> = {};
    MTF_ORDER.forEach((tf, i) => {
      const s = mtfSeries[i];
      if (s) series[tf] = s;
    });
    const last = cs[cs.length - 1];
    return {
      symbol: asset.symbol,
      timeframe,
      generatedAt: Date.now(),
      price: ticker?.price ?? null,
      lastClosed: last ? { openTime: last.openTime, close: last.close } : null,
      quality: main.quality ?? null,
      structure: { external: view(external), internal: view(internal) },
      liquidity,
      mtf: analyzeMtf(series),
      candles: cs,
    };
  });
  return res.value;
}
