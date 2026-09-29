import { describe, expect, it } from "vitest";
import { resolveTrade, summarizeTrades, walkForward, wilsonInterval } from "@/lib/patterns/backtest";
import { candlesFromCloses, syntheticSeries } from "../helpers";
import type { Candle } from "@/types/market";

const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ openTime: i * 1000, closeTime: i * 1000 + 999, open: o, high: h, low: l, close: c, volume: 1 });

describe("resolveTrade", () => {
  it("alvo atingido primeiro → win", () => {
    const cs = [bar(0, 100, 101, 99, 100), bar(1, 100, 106, 99, 105), bar(2, 105, 107, 90, 95)];
    expect(resolveTrade(cs, 0, "bullish", 100, 105, 95, 10)).toMatchObject({ outcome: "win", bars: 1, exit: 105 });
  });
  it("alvo e stop no mesmo candle → loss (conservador)", () => {
    const cs = [bar(0, 100, 101, 99, 100), bar(1, 100, 110, 90, 100)];
    expect(resolveTrade(cs, 0, "bullish", 100, 105, 95, 10).outcome).toBe("loss");
  });
  it("short: queda até o alvo → win", () => {
    const cs = [bar(0, 100, 101, 99, 100), bar(1, 100, 101, 94, 95)];
    expect(resolveTrade(cs, 0, "bearish", 100, 95, 105, 10).outcome).toBe("win");
  });
  it("nada atingido no horizonte → expired no fechamento", () => {
    const cs = [bar(0, 100, 101, 99, 100), bar(1, 100, 102, 98, 101), bar(2, 101, 102, 99, 102)];
    expect(resolveTrade(cs, 0, "bullish", 100, 110, 90, 2)).toMatchObject({ outcome: "expired", bars: 2, exit: 102 });
  });
});

describe("walkForward", () => {
  it("é causal: truncar o futuro não altera operações já resolvidas", () => {
    const cs = candlesFromCloses(syntheticSeries(500, { seed: 7, noise: 0.03 }));
    const full = walkForward(cs, { horizon: 30 });
    const cut = walkForward(cs.slice(0, 420), { horizon: 30 });
    const key = (t: { key: string; entryIndex: number; outcome: string }) => `${t.key}@${t.entryIndex}:${t.outcome}`;
    const fullSet = new Set(full.map(key));
    for (const t of cut) expect(fullSet.has(key(t))).toBe(true);
  });
  it("retorno com sinal da direção e geometria válida", () => {
    const cs = candlesFromCloses(syntheticSeries(600, { seed: 3, noise: 0.04 }));
    for (const t of walkForward(cs)) {
      if (t.direction === "bullish") expect(t.target).toBeGreaterThan(t.entry);
      else expect(t.target).toBeLessThan(t.entry);
      if (t.outcome === "win") expect(t.returnPct).toBeGreaterThan(0);
      if (t.outcome === "loss") expect(t.returnPct).toBeLessThan(0);
    }
  });
});

describe("summarizeTrades / wilsonInterval", () => {
  it("taxa de acerto ignora expiradas", () => {
    const base = { direction: "bullish" as const, entryIndex: 0, entryTime: 0, entry: 1, target: 2, stop: 0.5, confidence: 70, bars: 1 };
    const s = summarizeTrades([
      { ...base, key: "double_bottom", outcome: "win", returnPct: 10 },
      { ...base, key: "double_bottom", outcome: "loss", returnPct: -5 },
      { ...base, key: "double_bottom", outcome: "expired", returnPct: 1 },
    ]);
    expect(s[0]).toMatchObject({ key: "double_bottom", samples: 3, wins: 1, losses: 1, expired: 1, hitRate: 0.5 });
    expect(s[0]?.avgReturnPct).toBeCloseTo(2);
  });
  it("Wilson: 2/2 não vira 100% de certeza", () => {
    const w = wilsonInterval(2, 2)!;
    expect(w.high).toBeCloseTo(1);
    expect(w.low).toBeLessThan(0.4);
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});
