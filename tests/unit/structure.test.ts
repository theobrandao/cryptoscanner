import { describe, expect, it } from "vitest";
import { analyzeStructure, buildSwings, strengthPivots } from "@/lib/engines/structure";
import { buildLiquidityMap } from "@/lib/engines/liquidity";
import { analyzeMtf, emaTrendScore } from "@/lib/engines/mtf";
import type { Candle } from "@/types/market";

const H4 = 4 * 3600_000;
/** Série por pontos de virada, interpolação linear, `bars` candles por perna; pavio de 0,1% além do corpo. */
function path(points: number[], bars = 8, start = Date.UTC(2026, 0, 5)): Candle[] {
  const closes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as number;
    const b = points[i] as number;
    for (let k = 1; k <= bars; k++) closes.push(a + ((b - a) * k) / bars);
  }
  return closes.map((close, i) => {
    const open = i === 0 ? (points[0] as number) : (closes[i - 1] as number);
    const high = Math.max(open, close) * 1.001;
    const low = Math.min(open, close) * 0.999;
    return { openTime: start + i * H4, closeTime: start + (i + 1) * H4 - 1, open, high, low, close, volume: 100 };
  });
}

describe("strengthPivots", () => {
  it("topos iguais: o primeiro vale (sem cancelamento mútuo)", () => {
    const cs = path([100, 110, 100, 110, 100], 5);
    const highs = strengthPivots(cs, 2).filter((p) => p.kind === "high");
    expect(highs.length).toBe(2);
  });
});

describe("Market Structure", () => {
  it("tendência de alta: HH/HL e BOS altista; sem CHoCH", () => {
    const cs = path([100, 110, 104, 116, 109, 123, 115, 130], 8);
    const st = analyzeStructure(cs, { strength: 3, minAtr: 0.5 });
    const labels = st.swings.map((s) => s.label).filter(Boolean);
    expect(labels).toContain("HH");
    expect(labels).toContain("HL");
    expect(labels).not.toContain("LL");
    expect(st.events.every((e) => e.direction === "bullish" && e.type === "BOS")).toBe(true);
    expect(st.trend).toBe("bullish");
  });

  it("reversão: após alta, quebra do último HL por fechamento = CHoCH (ou MSS) baixista", () => {
    const cs = path([100, 110, 104, 116, 109, 120, 100, 95], 8);
    const st = analyzeStructure(cs, { strength: 3, minAtr: 0.5 });
    const bear = st.events.find((e) => e.direction === "bearish");
    expect(bear).toBeDefined();
    expect(["CHoCH", "MSS"]).toContain(bear?.type);
    expect(st.trend).toBe("bearish");
  });

  it("é causal: eventos da série truncada existem na série completa", () => {
    const cs = path([100, 110, 104, 116, 109, 120, 100, 95, 103, 90], 8);
    const full = analyzeStructure(cs, { strength: 3, minAtr: 0.5 }).events.map((e) => `${e.type}@${e.index}`);
    const cut = analyzeStructure(cs.slice(0, 50), { strength: 3, minAtr: 0.5 }).events.map((e) => `${e.type}@${e.index}`);
    for (const e of cut) expect(full).toContain(e);
  });

  it("filtro ATR: oscilação pequena não vira swing externo", () => {
    const base = path([100, 100.3, 100, 100.3, 100, 100.3, 100], 6);
    const big = buildSwings(base, { strength: 2, minAtr: 3 });
    expect(big.length).toBeLessThanOrEqual(1);
  });

  it("pavio além do topo com fechamento abaixo = failed breakout", () => {
    const cs = path([100, 110, 104, 109.5, 104], 8);
    // candle que fura o topo de 110 com pavio e fecha abaixo
    const i = cs.length - 6;
    const c = cs[i] as Candle;
    cs[i] = { ...c, high: 110.8, close: Math.min(c.close, 109), open: Math.min(c.open, 109) };
    const st = analyzeStructure(cs, { strength: 3, minAtr: 0.5 });
    expect(st.failed.some((f) => f.type === "failed_breakout" && Math.abs(f.level - 110 * 1.001) < 0.2)).toBe(true);
  });
});

describe("Liquidity", () => {
  it("topos iguais viram EQH (BSL) disponível acima do preço", () => {
    const cs = path([100, 110, 103, 110.05, 102, 104], 8);
    const st = analyzeStructure(cs, { strength: 3, minAtr: 0.5 });
    const map = buildLiquidityMap(cs, st.swings, { equalTolAtr: 0.3 });
    const eqh = map.pools.find((p) => p.kind === "EQH");
    expect(eqh).toBeDefined();
    expect(eqh?.side).toBe("BSL");
    expect(eqh?.state).toBe("available");
    expect(map.nearestAbove).not.toBeNull();
  });

  it("varredura: pavio abaixo do EQL e fechamento de volta = swept + sweep bullish recente", () => {
    const cs = path([110, 100, 106, 100.05, 107, 103], 8);
    const last = cs[cs.length - 1] as Candle;
    cs.push({ openTime: last.closeTime + 1, closeTime: last.closeTime + H4, open: 103, high: 104, low: 99, close: 103.5, volume: 300 });
    const st = analyzeStructure(cs.slice(0, -1), { strength: 3, minAtr: 0.5 });
    const map = buildLiquidityMap(cs, st.swings, { equalTolAtr: 0.3, recentBars: 5 });
    const eql = map.pools.find((p) => p.kind === "EQL");
    expect(eql?.state).toBe("swept");
    expect(map.recentSweeps[0]?.direction).toBe("bullish");
  });

  it("PDH/PDL do último dia fechado (UTC)", () => {
    const cs = path([100, 104, 101, 103], 8, Date.UTC(2026, 0, 5));
    const dayStart = Date.UTC(2026, 0, 4);
    const daily: Candle[] = [{ openTime: dayStart, closeTime: Date.UTC(2026, 0, 5) - 1, open: 99, high: 108, low: 95, close: 100, volume: 1 }];
    const map = buildLiquidityMap(cs, [], { daily });
    expect(map.pools.find((p) => p.kind === "PDH")?.price).toBe(108);
    expect(map.pools.find((p) => p.kind === "PDL")?.price).toBe(95);
  });
});

describe("MTF", () => {
  it("todos os TFs em alta → aligned_bull e score 100", () => {
    const up = path([100, 110, 104, 116, 109, 123, 115, 130, 122, 138, 130, 146], 12);
    const r = analyzeMtf({ "1w": up, "1d": up, "4h": up });
    expect(r.alignmentScore).toBe(100);
    expect(r.alignment).toBe("aligned_bull");
    expect(emaTrendScore(up)).toBeGreaterThan(0);
  });
  it("HTF em alta e LTF em baixa → mixed", () => {
    const up = path([100, 110, 104, 116, 109, 123, 115, 130, 122, 138, 130, 146], 12);
    const down = path([146, 130, 138, 122, 130, 115, 123, 109, 116, 104, 110, 100], 12);
    const r = analyzeMtf({ "1w": up, "1d": up, "4h": down, "1h": down });
    expect(r.alignment).toBe("mixed");
    expect(r.alignmentScore).toBeGreaterThan(0);
  });
});
