/**
 * Gera os candidatos do setup (gatilhos TRIGGERED) com o contexto disponível NO INSTANTE do gatilho,
 * mais o caminho de preço seguinte (para simular saídas depois). Causal: a análise vê só candles[0..t].
 *   npx tsx tools/research/gen-candidates.ts <history.json> <saida.json> [SYMBOLS=A,B,...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "@/types/market";
import { analyzeStructure, EXTERNAL, INTERNAL } from "@/lib/engines/structure";
import { buildLiquidityMap } from "@/lib/engines/liquidity";
import { computeTechnicals } from "@/lib/engines/technicals";
import { buildSetupGeometry, evaluateSetup } from "@/lib/engines/setup";
import { computeConfluence } from "@/lib/engines/confluence";
import { classifyRegime } from "@/lib/engines/regime";
import { sliceUntil } from "@/lib/strategies/engine";

type Hist = Record<string, { "4h": Candle[]; "1d": Candle[]; "1w": Candle[] }>;

export interface Candidate {
  symbol: string;
  t: number;
  time: number;
  direction: "bullish" | "bearish";
  entry: number;
  atr: number;
  stop: number;
  ideal: number;
  zoneLow: number;
  zoneHigh: number;
  tp1: number | null;
  tp1R: number | null;
  tp2: number | null;
  keySource: string;
  riskAtr: number;
  eventType: string;
  displacementAtr: number;
  regime: string;
  emaScore: number;
  rsi: number | null;
  macdHist: number | null;
  rvol: number | null;
  atrPct: number | null;
  atrPercentile: number | null;
  rangePosition: number | null;
  sweepWith: boolean;
  confNorm: number;
  comps: Record<string, number>;
  htf1dTrend: string;
  htf1dEma: number;
  htf1wTrend: string;
  /** caminho seguinte: [high, low, close] por candle */
  path: Array<[number, number, number]>;
}

function main() {
  const [, , inFile, outFile, symbolsArg] = process.argv;
  const hist = JSON.parse(readFileSync(inFile as string, "utf8")) as Hist;
  const symbols = symbolsArg ? symbolsArg.split(",") : Object.keys(hist);
  const out: Candidate[] = [];
  const WINDOW = 220;
  const HORIZON = 80;
  for (const sym of symbols) {
    const h = hist[sym];
    if (!h) continue;
    const cs = h["4h"];
    const t0 = Date.now();
    let n = 0;
    for (let t = 250; t < cs.length - 1; t++) {
      const w = cs.slice(t + 1 - WINDOW, t + 1);
      const ext = analyzeStructure(w, EXTERNAL);
      const dir = ext.trend;
      if (dir === "neutral") continue;
      const int = analyzeStructure(w, INTERNAL);
      const liq = buildLiquidityMap(w, [...ext.swings, ...int.swings].sort((a, b) => a.index - b.index));
      const g = buildSetupGeometry(w, dir, ext, int, liq);
      if (!g) continue;
      const tech = computeTechnicals(w);
      const conf = computeConfluence({
        direction: dir,
        external: ext,
        mtf: { rows: [], alignmentScore: 0, alignment: "insufficient", summary: "" },
        liquidity: liq,
        technicals: tech,
        setup: g,
        derivatives: null,
        historical: null,
        dataStatus: null,
        barsInSeries: w.length,
      });
      const availMax = conf.components.filter((c) => c.available).reduce((s, c) => s + c.max, 0);
      const confNorm = availMax > 0 ? Math.max(0, Math.min(100, ((conf.raw + conf.penaltyTotal) / availMax) * 100)) : 0;
      const ev = evaluateSetup(w, g, int, true, confNorm);
      if (ev.state !== "TRIGGERED") continue;
      const c = cs[t] as Candle;
      const entry = c.close;
      const long = dir === "bullish";
      if (long ? !(g.stop < entry) : !(g.stop > entry)) continue;
      const risk = Math.abs(entry - g.stop);
      const tp1 = g.targets[0]?.price ?? null;
      const trig = int.events.find((e) => e.index === ev.triggerIndex && e.direction === dir);
      const d1 = sliceUntil(h["1d"], c.closeTime, 300);
      const w1 = sliceUntil(h["1w"], c.closeTime, 200);
      const d1ext = d1.length >= 60 ? analyzeStructure(d1, EXTERNAL) : null;
      const d1tech = d1.length >= 60 ? computeTechnicals(d1, { intradayVwap: false }) : null;
      const w1ext = w1.length >= 40 ? analyzeStructure(w1, EXTERNAL) : null;
      const path: Array<[number, number, number]> = cs.slice(t + 1, t + 1 + HORIZON).map((x) => [x.high, x.low, x.close]);
      out.push({
        symbol: sym,
        t,
        time: c.openTime,
        direction: dir,
        entry,
        atr: g.atr,
        stop: g.stop,
        ideal: g.idealEntry,
        zoneLow: g.entryZone.low,
        zoneHigh: g.entryZone.high,
        tp1,
        tp1R: tp1 != null ? Math.abs(tp1 - entry) / risk : null,
        tp2: g.targets[1]?.price ?? null,
        keySource: g.keyLevel.source,
        riskAtr: risk / g.atr,
        eventType: trig?.type ?? "?",
        displacementAtr: trig?.displacementAtr ?? 0,
        regime: classifyRegime(ext, tech, w.length).regime,
        emaScore: tech.emaScore,
        rsi: tech.rsi,
        macdHist: tech.macd.histogram,
        rvol: tech.rvol,
        atrPct: tech.atrPct,
        atrPercentile: tech.atrPercentile,
        rangePosition: ext.rangePosition,
        sweepWith: liq.recentSweeps.some((s) => s.direction === dir && s.barsAgo <= 10),
        confNorm,
        comps: Object.fromEntries(conf.components.map((k) => [k.key, k.score])),
        htf1dTrend: d1ext?.trend ?? "n/a",
        htf1dEma: d1tech?.emaScore ?? 0,
        htf1wTrend: w1ext?.trend ?? "n/a",
        path,
      });
      n++;
    }
    console.log(sym, n, "candidatos", `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  writeFileSync(outFile as string, JSON.stringify(out));
}
main();
