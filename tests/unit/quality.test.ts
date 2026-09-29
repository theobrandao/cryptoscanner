import { describe, expect, it } from "vitest";
import { classifyStatus, isValidCandle, priceDivergencePct, validateCandles } from "@/lib/engines/quality";
import type { Candle } from "@/types/market";

const H = 3600_000;
const c = (i: number, o: number, h: number, l: number, cl: number, v = 10): Candle => ({ openTime: i * 4 * H, closeTime: (i + 1) * 4 * H - 1, open: o, high: h, low: l, close: cl, volume: v });

describe("isValidCandle", () => {
  it("aceita OHLC coerente e rejeita incoerente/NaN/negativo", () => {
    expect(isValidCandle(c(0, 10, 12, 9, 11))).toBe(true);
    expect(isValidCandle(c(0, 10, 9.5, 9, 11))).toBe(false); // high < close
    expect(isValidCandle(c(0, 10, 12, 10.5, 11))).toBe(false); // low > open
    expect(isValidCandle(c(0, NaN, 12, 9, 11))).toBe(false);
    expect(isValidCandle(c(0, 10, 12, 9, 11, -1))).toBe(false);
    expect(isValidCandle({ ...c(0, 10, 12, 9, 11), closeTime: 0 })).toBe(false);
  });
});

describe("validateCandles", () => {
  it("ordena, remove duplicado e inválido, conta lacuna e separa o candle em formação", () => {
    const now = 6 * 4 * H + 60_000; // dentro do candle 6
    const input = [c(2, 10, 11, 9, 10.5), c(0, 10, 11, 9, 10), c(1, 10, 11, 9, 10), c(1, 10, 11.5, 9, 11), c(3, 10, 9, 9, 10), c(5, 10, 11, 9, 10), c(6, 10, 11, 9, 10.2)];
    const v = validateCandles(input, "4h", now);
    expect(v.candles.map((x) => x.openTime / (4 * H))).toEqual([0, 1, 2, 5, 6]);
    expect(v.duplicates).toBe(1);
    expect(v.candles[1]?.close).toBe(11); // mantém o último recebido
    expect(v.invalid).toBe(1);
    expect(v.gaps).toBe(2); // 3 (inválido) e 4 ausentes
    expect(v.forming?.openTime).toBe(6 * 4 * H);
    expect(v.closed).toHaveLength(4);
  });
  it("sem candle em formação quando o último já fechou", () => {
    const v = validateCandles([c(0, 10, 11, 9, 10), c(1, 10, 11, 9, 10)], "4h", 10 * 4 * H);
    expect(v.forming).toBeNull();
    expect(v.closed).toHaveLength(2);
  });
});

describe("classifyStatus", () => {
  const now = 100 * 4 * H;
  const base = { source: "binance", primarySource: "binance", fetchedAt: now - 5000, stale: false, timeframe: "4h" as const, lastClosedOpenTime: now - 2 * 4 * H, now };
  it("LIVE / FALLBACK / DEGRADED / DELAYED / OFFLINE", () => {
    expect(classifyStatus(base).status).toBe("LIVE");
    expect(classifyStatus({ ...base, source: "kraken" }).status).toBe("FALLBACK");
    expect(classifyStatus({ ...base, gaps: 1 }).status).toBe("DEGRADED");
    expect(classifyStatus({ ...base, divergencePct: 0.9 }).issues.join()).toMatch(/DATA DISCREPANCY/);
    expect(classifyStatus({ ...base, stale: true }).status).toBe("DELAYED");
    expect(classifyStatus({ ...base, lastClosedOpenTime: now - 10 * 4 * H }).status).toBe("DELAYED");
    expect(classifyStatus({ ...base, fetchedAt: 0 }).status).toBe("OFFLINE");
  });
  it("prioridade: DELAYED vence DEGRADED e FALLBACK", () => {
    expect(classifyStatus({ ...base, stale: true, gaps: 3, source: "kraken" }).status).toBe("DELAYED");
  });
});

describe("priceDivergencePct", () => {
  it("calcula e rejeita entradas inválidas", () => {
    expect(priceDivergencePct(100, 100.5)).toBeCloseTo(0.5);
    expect(priceDivergencePct(0, 1)).toBeNull();
    expect(priceDivergencePct(NaN, 1)).toBeNull();
  });
});
