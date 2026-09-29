import { describe, expect, it } from "vitest";
import { atr, bollinger, ema, historicalVolatility, last, macd, roc, rsi, sma, stochRsi } from "@/lib/indicators/core";
import { findPivots, linearRegression, supportResistance } from "@/lib/indicators/levels";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { candlesFromCloses, syntheticSeries } from "../helpers";

describe("indicadores básicos", () => {
  it("SMA e EMA respeitam o período de aquecimento", () => {
    const v = [1, 2, 3, 4, 5, 6];
    const s = sma(v, 3);
    expect(s.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(s[2]).toBeCloseTo(2);
    expect(s[5]).toBeCloseTo(5);
    const e = ema(v, 3);
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(3);
  });

  it("RSI fica entre 0 e 100 e sobe em tendência de alta", () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const r = rsi(up, 14);
    expect(last(r)).toBeCloseTo(100);
    const mixed = syntheticSeries(200, { noise: 0.02 });
    for (const x of rsi(mixed, 14)) if (!Number.isNaN(x)) expect(x).toBeGreaterThanOrEqual(0);
  });

  it("MACD: linha = EMA12 − EMA26; histograma = macd − sinal", () => {
    const v = syntheticSeries(120, { noise: 0.015 });
    const m = macd(v);
    const i = v.length - 1;
    expect(m.macd[i]).toBeCloseTo((ema(v, 12)[i] ?? 0) - (ema(v, 26)[i] ?? 0), 8);
    expect(m.histogram[i]).toBeCloseTo((m.macd[i] ?? 0) - (m.signal[i] ?? 0), 8);
  });

  it("Bollinger: banda superior > média > inferior e %B coerente", () => {
    const v = syntheticSeries(80, { noise: 0.02 });
    const bb = bollinger(v, 20, 2);
    const i = v.length - 1;
    expect(bb.upper[i]!).toBeGreaterThan(bb.middle[i]!);
    expect(bb.middle[i]!).toBeGreaterThan(bb.lower[i]!);
    expect(bb.percentB[i]!).toBeCloseTo(((v[i] ?? 0) - bb.lower[i]!) / (bb.upper[i]! - bb.lower[i]!), 8);
  });

  it("ATR é positivo e StochRSI fica em 0..100", () => {
    const c = candlesFromCloses(syntheticSeries(120, { noise: 0.02 }));
    expect(last(atr(c, 14))).toBeGreaterThan(0);
    const st = stochRsi(c.map((k) => k.close));
    const k = last(st.k);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThanOrEqual(100);
  });

  it("ROC e volatilidade histórica", () => {
    const v = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
    expect(last(roc(v, 10))).toBeCloseTo(10);
    const hv = historicalVolatility(syntheticSeries(60, { noise: 0.03 }), 20);
    expect(last(hv)).toBeGreaterThan(0);
  });
});

describe("níveis e pivôs", () => {
  it("encontra pivôs fractais em zigue-zague", () => {
    const zig = Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 3));
    const c = candlesFromCloses(zig);
    const p = findPivots(c, 3, 3);
    expect(p.filter((x) => x.kind === "high").length).toBeGreaterThan(1);
    expect(p.filter((x) => x.kind === "low").length).toBeGreaterThan(1);
  });

  it("classifica suportes abaixo e resistências acima do preço", () => {
    const zig = Array.from({ length: 120 }, (_, i) => 100 + 8 * Math.sin(i / 4));
    const c = candlesFromCloses(zig);
    const { supports, resistances } = supportResistance(c);
    const price = c[c.length - 1]!.close;
    for (const s of supports) expect(s.price).toBeLessThanOrEqual(price);
    for (const r of resistances) expect(r.price).toBeGreaterThan(price);
  });

  it("regressão linear recupera a inclinação", () => {
    const { slope, r2 } = linearRegression([1, 3, 5, 7, 9]);
    expect(slope).toBeCloseTo(2);
    expect(r2).toBeCloseTo(1);
  });
});

describe("snapshot", () => {
  it("classifica tendência de alta numa série ascendente", () => {
    const c = candlesFromCloses(syntheticSeries(250, { drift: 0.004, noise: 0.004 }));
    const s = computeSnapshot(c);
    expect(s.trend).toBe("bullish");
    expect(s.ema8).toBeGreaterThan(s.ema25);
    expect(s.candlesUsed).toBe(250);
    expect(s.relativeVolume).toBeCloseTo(1, 1);
  });

  it("classifica tendência de baixa numa série descendente", () => {
    const c = candlesFromCloses(syntheticSeries(250, { drift: -0.004, noise: 0.004 }));
    expect(computeSnapshot(c).trend).toBe("bearish");
  });
});

describe("linhas de tendência (LTA/LTB)", () => {
  it("encontra LTA em zigue-zague ascendente e LTB em descendente", async () => {
    const { detectTrendLines } = await import("@/lib/indicators/trendlines");
    const { candlesFromCloses } = await import("../helpers");
    const up = Array.from({ length: 120 }, (_, i) => 100 + i * 0.4 + 3 * Math.sin(i / 3));
    const lta = detectTrendLines(candlesFromCloses(up)).find((l) => l.kind === "LTA");
    expect(lta).toBeDefined();
    expect(lta!.slopePerBar).toBeGreaterThan(0);
    expect(lta!.to.price).toBeGreaterThan(lta!.from.price);
    const down = up.map((v) => 300 - v);
    const ltb = detectTrendLines(candlesFromCloses(down)).find((l) => l.kind === "LTB");
    expect(ltb).toBeDefined();
    expect(ltb!.slopePerBar).toBeLessThan(0);
  });

  it("marca a LTA como rompida quando o preço fecha abaixo dela", async () => {
    const { detectTrendLines } = await import("@/lib/indicators/trendlines");
    const { candlesFromCloses } = await import("../helpers");
    const up = Array.from({ length: 110 }, (_, i) => 100 + i * 0.4 + 3 * Math.sin(i / 3));
    const crash = [...up, ...Array.from({ length: 6 }, (_, k) => up[up.length - 1]! - 15 - k * 3)];
    const lta = detectTrendLines(candlesFromCloses(crash)).find((l) => l.kind === "LTA");
    expect(lta?.broken).toBe(true);
  });

  it("retorna vazio com poucos candles", async () => {
    const { detectTrendLines } = await import("@/lib/indicators/trendlines");
    const { candlesFromCloses } = await import("../helpers");
    expect(detectTrendLines(candlesFromCloses([1, 2, 3]))).toEqual([]);
  });
});
