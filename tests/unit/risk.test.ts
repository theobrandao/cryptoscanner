import { describe, expect, it } from "vitest";
import { averagePrice, expectedValueR, liquidationPrice, liquidationView, positionSize, rMultiple, smartStops, stressTest } from "@/lib/engines/risk";

describe("positionSize", () => {
  it("conta 10.000, risco 1%, entrada 100, stop 95 → 20 unidades", () => {
    const r = positionSize({ account: 10_000, riskPct: 1, entry: 100, stop: 95, target: 115, leverage: 10 });
    expect(r.side).toBe("long");
    expect(r.qty).toBeCloseTo(20);
    expect(r.notional).toBeCloseTo(2000);
    expect(r.margin).toBeCloseTo(200);
    expect(r.capitalAtRisk).toBeCloseTo(100);
    expect(r.rewardRisk).toBeCloseTo(3);
    expect(r.stopDistancePct).toBeCloseTo(5);
  });
  it("short e taxas reduzem a quantidade", () => {
    const r = positionSize({ account: 10_000, riskPct: 1, entry: 100, stop: 105, feePct: 0.05 });
    expect(r.side).toBe("short");
    expect(r.qty).toBeCloseTo(100 / (5 + 0.0005 * 205), 6);
  });
  it("rejeita entrada = stop", () => {
    expect(() => positionSize({ account: 1000, riskPct: 1, entry: 100, stop: 100 })).toThrow();
  });
  it("aviso quando a margem passa da conta", () => {
    const r = positionSize({ account: 1000, riskPct: 2, entry: 100, stop: 99.9 });
    expect(r.exceedsBuyingPower).toBe(true);
  });
});

describe("liquidationPrice (fórmula Binance, cum=0)", () => {
  it("long 10x, MMR 0,5%: 100 × 0,9 / 0,995", () => {
    expect(liquidationPrice({ side: "long", entry: 100, qty: 1, leverage: 10, mmr: 0.005 })).toBeCloseTo(90 / 0.995, 6);
  });
  it("short 10x, MMR 0,5%: 100 × 1,1 / 1,005", () => {
    expect(liquidationPrice({ side: "short", entry: 100, qty: 1, leverage: 10, mmr: 0.005 })).toBeCloseTo(110 / 1.005, 6);
  });
  it("no preço de liquidação o patrimônio iguala a margem de manutenção", () => {
    const lp = liquidationPrice({ side: "long", entry: 50_000, qty: 0.2, leverage: 20, mmr: 0.004 });
    const margin = (0.2 * 50_000) / 20;
    const equity = margin + (lp - 50_000) * 0.2;
    expect(equity).toBeCloseTo(0.2 * lp * 0.004, 6);
  });
  it("cross com saldo maior afasta a liquidação", () => {
    const iso = liquidationPrice({ side: "long", entry: 100, qty: 10, leverage: 10 });
    const cross = liquidationPrice({ side: "long", entry: 100, qty: 10, leverage: 10, marginMode: "cross", walletBalance: 500 });
    expect(cross).toBeLessThan(iso);
  });
  it("long 1x sem liquidação positiva relevante", () => {
    expect(liquidationPrice({ side: "long", entry: 100, qty: 1, leverage: 1, mmr: 0.005 })).toBeCloseTo(0);
  });
  it("view: distância e stop antes da liquidação", () => {
    const v = liquidationView({ side: "long", entry: 100, qty: 1, leverage: 10, mmr: 0.005, atr: 2, stop: 95 });
    expect(v.distancePct).toBeCloseTo(100 - 90 / 0.995, 4);
    expect(v.distanceAtr).toBeCloseTo((100 - 90 / 0.995) / 2, 4);
    expect(v.stopBeforeLiquidation).toBe(true);
  });
});

describe("averagePrice", () => {
  it("long 1 @100 + 1 @90 → médio 95, risco até stop 85 sobe de 15 para 20", () => {
    const r = averagePrice({ side: "long", qty: 1, entry: 100, leverage: 10, addQty: 1, addPrice: 90, stop: 85 });
    expect(r.newEntry).toBeCloseTo(95);
    expect(r.newMargin).toBeCloseTo(19);
    expect(r.effectiveLeverage).toBeCloseTo(10);
    expect(r.riskBefore).toBeCloseTo(15);
    expect(r.riskAfter).toBeCloseTo(20);
    expect(r.warnings.join()).toMatch(/contra a posição/);
  });
});

describe("stressTest", () => {
  it("long 10x: −10% liquida, +5% dá lucro de 50% da margem", () => {
    const rows = stressTest({ side: "long", qty: 1, entry: 100, leverage: 10, mmr: 0.005 }, [-10, 5]);
    expect(rows[0]?.liquidated).toBe(true);
    expect(rows[1]?.pnl).toBeCloseTo(5);
    expect(rows[1]?.pnlPctOfMargin).toBeCloseTo(50);
  });
});

describe("smartStops / R / EV", () => {
  it("stops do lado certo e ordenados por distância", () => {
    const s = smartStops({ side: "long", entry: 100, atr: 2, invalidation: 96, micro: 98.5 });
    expect(s.map((x) => x.kind)).toEqual(["structural", "volatility", "tight"]);
    expect(s[0]?.price).toBeCloseTo(95.8);
    expect(s[1]?.price).toBeCloseTo(94);
    expect(s[2]?.price).toBeCloseTo(98.3);
    expect(s.every((x) => x.price < 100)).toBe(true);
  });
  it("R-múltiplo e EV", () => {
    expect(rMultiple(100, 95, 110)).toBeCloseTo(2);
    expect(rMultiple(100, 105, 110)).toBeCloseTo(-2);
    expect(expectedValueR(0.5, 2, 1)).toBeCloseTo(0.5);
  });
});
