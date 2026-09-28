import { describe, expect, it } from "vitest";
import { detectPatterns } from "@/lib/patterns/detect";
import { PATTERN_CATALOG, PATTERN_KEYS, PATTERN_LIST } from "@/lib/patterns/catalog";
import { candlesFromCloses, doubleBottomCloses, doubleTopCloses, syntheticSeries } from "../helpers";

describe("catálogo de padrões", () => {
  it("cobre os 17 padrões (8 de alta, 8 de baixa, 1 neutro)", () => {
    expect(PATTERN_KEYS.length).toBe(17);
    expect(PATTERN_LIST.filter((p) => p.direction === "bullish").length).toBe(8);
    expect(PATTERN_LIST.filter((p) => p.direction === "bearish").length).toBe(8);
    expect(PATTERN_LIST.filter((p) => p.direction === "neutral").length).toBe(1);
    expect(PATTERN_CATALOG.double_bottom.label).toBe("Fundo Duplo");
  });
});

describe("detecção", () => {
  it("retorna vazio com poucos candles", () => {
    expect(detectPatterns(candlesFromCloses([1, 2, 3]))).toEqual([]);
  });

  it("detecta fundo duplo em série sintética", () => {
    const m = detectPatterns(candlesFromCloses(doubleBottomCloses()), { minConfidence: 50 });
    const db = m.find((x) => x.key === "double_bottom");
    expect(db).toBeDefined();
    expect(db!.direction).toBe("bullish");
    expect(db!.target).toBeGreaterThan(db!.price);
    expect(db!.stop).toBeLessThan(db!.price);
    expect(db!.confidence).toBeGreaterThanOrEqual(50);
    expect(db!.confidence).toBeLessThanOrEqual(100);
  });

  it("detecta topo duplo na série espelhada", () => {
    const m = detectPatterns(candlesFromCloses(doubleTopCloses()), { minConfidence: 50 });
    const dt = m.find((x) => x.key === "double_top");
    expect(dt).toBeDefined();
    expect(dt!.direction).toBe("bearish");
    expect(dt!.target).toBeLessThan(dt!.price);
  });

  it("detecta consolidação lateral em faixa estreita", () => {
    const flat = Array.from({ length: 80 }, (_, i) => 100 + 0.3 * Math.sin(i / 2));
    const m = detectPatterns(candlesFromCloses(flat), { minConfidence: 50 });
    expect(m.some((x) => x.key === "lateral_consolidation")).toBe(true);
  });

  it("detecta pivô de alta (HH+HL) em zigue-zague ascendente", () => {
    const zig = Array.from({ length: 80 }, (_, i) => 100 + i * 0.6 + 4 * Math.sin(i / 2.5));
    const m = detectPatterns(candlesFromCloses(zig), { minConfidence: 50 });
    expect(m.some((x) => x.key === "pivot_bullish")).toBe(true);
    expect(m.some((x) => x.key === "pivot_bearish")).toBe(false);
  });

  it("detecta cunha de alta (viés de baixa) em zigue-zague ascendente convergente", () => {
    const wedge = Array.from({ length: 80 }, (_, i) => 100 + i * 0.3 + (6 - 0.06 * i) * Math.sin(i / 2.5));
    const m = detectPatterns(candlesFromCloses(wedge), { minConfidence: 50 });
    const rw = m.find((x) => x.key === "rising_wedge");
    expect(rw).toBeDefined();
    expect(rw!.direction).toBe("bearish");
    expect(rw!.target).toBeLessThan(rw!.price);
    expect(rw!.stop).toBeGreaterThan(rw!.price);
    expect(m.some((x) => x.key === "falling_wedge")).toBe(false);
  });

  it("detecta cunha de baixa (viés de alta) na série espelhada", () => {
    const wedge = Array.from({ length: 80 }, (_, i) => 100 - i * 0.3 + (6 - 0.06 * i) * Math.sin(i / 2.5));
    const m = detectPatterns(candlesFromCloses(wedge), { minConfidence: 50 });
    const fw = m.find((x) => x.key === "falling_wedge");
    expect(fw).toBeDefined();
    expect(fw!.direction).toBe("bullish");
    expect(m.some((x) => x.key === "rising_wedge")).toBe(false);
  });

  it("respeita a confiança mínima e ordena por confiança", () => {
    const m = detectPatterns(candlesFromCloses(syntheticSeries(200, { noise: 0.02 })), { minConfidence: 90 });
    for (const x of m) expect(x.confidence).toBeGreaterThanOrEqual(90);
    const all = detectPatterns(candlesFromCloses(doubleBottomCloses()), { minConfidence: 0 });
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.confidence).toBeGreaterThanOrEqual(all[i]!.confidence);
  });
});
