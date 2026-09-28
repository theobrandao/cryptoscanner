import { beforeEach, describe, expect, it } from "vitest";
import { detectVolumeAnomaly } from "@/lib/scanner/volume";
import { autoFibonacci, fibonacciLevels } from "@/lib/fibonacci";
import { cached, getCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rate-limit";
import { candlesFromCloses } from "../helpers";

describe("volume anômalo", () => {
  it("sinaliza aumento ≥ 100% sobre a média das 20 anteriores", () => {
    const c = candlesFromCloses(Array.from({ length: 30 }, () => 100));
    c[c.length - 1]!.volume = 2500; // média 1000 → +150%
    const a = detectVolumeAnomaly("BTC", "1h", c, { now: Number.MAX_SAFE_INTEGER });
    expect(a).not.toBeNull();
    expect(a!.increasePct).toBeCloseTo(150, 0);
    expect(a!.isCurrentCandle).toBe(false);
  });
  it("não sinaliza abaixo do limiar", () => {
    const c = candlesFromCloses(Array.from({ length: 30 }, () => 100));
    c[c.length - 1]!.volume = 1800;
    expect(detectVolumeAnomaly("BTC", "1h", c)).toBeNull();
  });
});

describe("fibonacci", () => {
  it("retrações de alta descem a partir da máxima", () => {
    const r = fibonacciLevels(200, 100, "up");
    const l618 = r.levels.find((l) => l.ratio === 0.618)!;
    expect(l618.price).toBeCloseTo(200 - 100 * 0.618);
    const ext = r.levels.find((l) => l.ratio === 1.618)!;
    expect(ext.price).toBeCloseTo(100 + 100 * 1.618);
  });
  it("swing automático usa máxima e mínima da janela", () => {
    const c = candlesFromCloses([100, 110, 120, 115, 105, 100, 108]);
    const r = autoFibonacci(c, 10)!;
    expect(r.high).toBeCloseTo(120 * 1.004, 2);
    expect(r.low).toBeCloseTo(100 * 0.996, 2);
  });
  it("rejeita máxima ≤ mínima", () => {
    expect(() => fibonacciLevels(100, 100, "up")).toThrow();
  });
});

describe("cache com fallback obsoleto", () => {
  beforeEach(() => getCache()._clearMemory());
  it("retorna valor da origem e depois do cache", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    const a = await cached("t:key", 60, loader);
    const b = await cached("t:key", 60, loader);
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
    expect(b.fromCache).toBe(true);
  });
  it("devolve stale quando a origem falha", async () => {
    await cached("t:stale", 1, async () => "ok");
    await getCache().del("t:stale");
    const r = await cached("t:stale", 1, async () => {
      throw new Error("origem fora");
    });
    expect(r.value).toBe("ok");
    expect(r.stale).toBe(true);
  });
  it("propaga erro sem stale disponível", async () => {
    await expect(
      cached("t:none", 1, async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
  });
});

describe("rate limit", () => {
  it("bloqueia após o limite na janela", async () => {
    const key = `k-${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("test", key, 3));
    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3]!.allowed).toBe(false);
  });
});
