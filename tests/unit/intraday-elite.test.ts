import { describe, expect, it } from "vitest";
import { ENTITLEMENTS, type Tier } from "@/lib/entitlements";
import { definitionSchema, type StrategyDefinition } from "@/lib/strategies/definition";
import { requireStrategyTimeframes, type AccessView } from "@/services/subscription-service";
import { checkBacktestAccess, type BacktestRequest } from "@/services/backtest-service";

/** 1H/30M/15M são do ELITE: estratégias e backtest seguem a mesma regra do scanner, agentes e monitores. */
const access = (tier: Tier): AccessView => ({ tier, status: "ACTIVE", plan: tier, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, daysLeft: null, trialDays: 3, provider: null, entitlements: ENTITLEMENTS[tier] });

const def = (...tfs: string[]): StrategyDefinition => definitionSchema.parse({ direction: "long", groups: [{ conditions: tfs.map((tf) => ({ tf, feature: "rsi", op: "<", value: 40 })) }] });

function errOf(fn: () => unknown): { status: number; code: string; message: string } {
  try {
    fn();
  } catch (err) {
    return err as { status: number; code: string; message: string };
  }
  throw new Error("esperava erro");
}

const bt = (over: Partial<BacktestRequest>): BacktestRequest => ({ symbol: "BTC", exchange: "binance", instrument: "spot", mode: "setup", timeframe: "4h", days: 90, costs: { feeBps: 10, slippageBps: 5, fundingPct8h: 0.01, entryDelay: 0, perp: false, riskPct: 1 }, ...over });

describe("estratégias: condição abaixo de 4H só no ELITE", () => {
  it("PRO e teste com condição 1H → 403 plan_required", () => {
    for (const tier of ["PRO", "TRIAL"] as const) expect(errOf(() => requireStrategyTimeframes(access(tier), def("4h", "1h"), "strategies"))).toMatchObject({ status: 403, code: "plan_required", message: "Timeframe 1H disponível apenas no plano ELITE." });
  });
  it("PRO com 4H/1D passa; ELITE e admin passam com 15M", () => {
    expect(() => requireStrategyTimeframes(access("PRO"), def("1d", "4h"), "strategies")).not.toThrow();
    expect(() => requireStrategyTimeframes(access("ELITE"), def("15m"), "strategies")).not.toThrow();
    expect(() => requireStrategyTimeframes(access("ADMIN"), def("5m", "1h"), "strategies")).not.toThrow();
  });
});

describe("backtest: timeframe intraday só no ELITE", () => {
  it("setup em 1H no PRO → 403 plan_required", () => {
    expect(errOf(() => checkBacktestAccess(access("PRO"), bt({ timeframe: "1h" })))).toMatchObject({ status: 403, code: "plan_required" });
  });
  it("estratégia de um só timeframe 1H no PRO → 403 plan_required (antes passava)", () => {
    expect(errOf(() => checkBacktestAccess(access("PRO"), bt({ mode: "strategy", definition: def("1h") })))).toMatchObject({ status: 403, code: "plan_required" });
  });
  it("PRO em 4H passa; multi-timeframe base continua 402 elite_required", () => {
    expect(() => checkBacktestAccess(access("PRO"), bt({ timeframe: "4h" }))).not.toThrow();
    expect(errOf(() => checkBacktestAccess(access("PRO"), bt({ mode: "strategy", definition: def("1d", "4h") })))).toMatchObject({ status: 402, code: "elite_required" });
  });
  it("ELITE roda setup 30M e estratégia 1D+1H", () => {
    expect(() => checkBacktestAccess(access("ELITE"), bt({ timeframe: "30m" }))).not.toThrow();
    expect(() => checkBacktestAccess(access("ELITE"), bt({ mode: "strategy", definition: def("1d", "1h") }))).not.toThrow();
  });
});

describe("scanner: volume anômalo segue o plano", () => {
  it("timeframes pedidos: 30M/1H no ELITE e admin; 4H para teste e PRO", async () => {
    const { volumeTimeframesFor } = await import("@/lib/scanner/volume");
    expect(volumeTimeframesFor("ELITE")).toEqual(["30m", "1h"]);
    expect(volumeTimeframesFor("ADMIN")).toEqual(["30m", "1h"]);
    expect(volumeTimeframesFor("PRO")).toEqual(["4h"]);
    expect(volumeTimeframesFor("TRIAL")).toEqual(["4h"]);
  });
  it("alertas de volume do scan manual: PRO não recebe 30M/1H", async () => {
    const { allowedVolumeAlerts } = await import("@/lib/scanner/volume");
    const a = (timeframe: string) => ({ symbol: "BTC", timeframe }) as unknown as import("@/lib/scanner/volume").VolumeAnomaly;
    expect(allowedVolumeAlerts("PRO", [a("30m"), a("1h"), a("4h")]).map((v) => v.timeframe)).toEqual(["4h"]);
    expect(allowedVolumeAlerts("ELITE", [a("30m"), a("1h")]).map((v) => v.timeframe)).toEqual(["30m", "1h"]);
  });
});
