import { describe, expect, it } from "vitest";
import { conditionSchema, definitionSchema, executionTf, timeframesOf, usesLiveOnly, type StrategyDefinition } from "@/lib/strategies/definition";
import { compare, computeFeatures, evaluateStrategy, sliceUntil } from "@/lib/strategies/engine";
import { runSignals, strategySignals, DEFAULT_COSTS } from "@/lib/backtest/engine";
import { fingerprintOf, setupEventFor } from "@/services/monitor-service";
import type { Candle } from "@/types/market";

const H4 = 4 * 3600_000;
function series(closes: number[], start = Date.UTC(2026, 0, 5), span = H4): Candle[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : (closes[i - 1] as number);
    return { openTime: start + i * span, closeTime: start + (i + 1) * span - 1, open, high: Math.max(open, close) * 1.002, low: Math.min(open, close) * 0.998, close, volume: 100 + (i % 5) * 20 };
  });
}
const wave = (n: number, base = 100, amp = 8, period = 24, drift = 0.05) => Array.from({ length: n }, (_, i) => base + drift * i + amp * Math.sin((2 * Math.PI * i) / period));

describe("Strategy Builder — definição", () => {
  it("valida tipo do valor e operador por feature", () => {
    expect(conditionSchema.safeParse({ tf: "4h", feature: "rsi", op: "<", value: 40 }).success).toBe(true);
    expect(conditionSchema.safeParse({ tf: "4h", feature: "trend", op: ">", value: "bullish" }).success).toBe(false);
    expect(conditionSchema.safeParse({ tf: "4h", feature: "trend", op: "==", value: "sideways" }).success).toBe(false);
    expect(conditionSchema.safeParse({ tf: "4h", feature: "above_ema200", op: "==", value: "sim" }).success).toBe(false);
  });
  it("timeframes, TF de execução e features só-ao-vivo", () => {
    const def = definitionSchema.parse({
      direction: "long",
      groups: [{ conditions: [{ tf: "1d", feature: "trend", op: "==", value: "bullish" }, { tf: "1h", feature: "rsi", op: "<", value: 40 }, { tf: "4h", feature: "confluence_score", op: ">=", value: 60 }] }],
    });
    expect(timeframesOf(def)).toEqual(["1d", "4h", "1h"]);
    expect(executionTf(def)).toBe("1h");
    expect(usesLiveOnly(def)).toEqual(["confluence_score"]);
    expect(def.exit.rr).toBe(2);
  });
});

describe("Strategy Builder — avaliação", () => {
  const def = definitionSchema.parse({
    direction: "long",
    logic: "OR",
    groups: [
      { logic: "AND", conditions: [{ tf: "4h", feature: "rsi", op: "<", value: 30 }, { tf: "1d", feature: "trend", op: "==", value: "bullish" }] },
      { logic: "OR", conditions: [{ tf: "4h", feature: "sweep", op: "==", value: "bullish" }] },
    ],
  });
  it("AND dentro do grupo, OR entre grupos; dado ausente nunca é verdadeiro", () => {
    expect(evaluateStrategy(def, { "4h": { rsi: 25, sweep: "none" }, "1d": { trend: "bullish" } }).pass).toBe(true);
    expect(evaluateStrategy(def, { "4h": { rsi: 35, sweep: "none" }, "1d": { trend: "bullish" } }).pass).toBe(false);
    expect(evaluateStrategy(def, { "4h": { rsi: 35, sweep: "bullish" } }).pass).toBe(true);
    const miss = evaluateStrategy(def, { "4h": { rsi: 25, sweep: "none" } });
    expect(miss.pass).toBe(false);
    expect(miss.missing.join()).toMatch(/1D/);
    expect(compare(null, ">", 1)).toBe(false);
    expect(compare(true, "==", true)).toBe(true);
  });
  it("features numéricas saem dos candles fechados", () => {
    const f = computeFeatures(series(wave(300)));
    expect(typeof f.rsi).toBe("number");
    expect(["bullish", "bearish", "neutral"]).toContain(f.trend);
    expect(f.bb_position).not.toBeNull();
  });
  it("sliceUntil é causal (nada com closeTime depois do instante)", () => {
    const d = series(wave(50), Date.UTC(2026, 0, 1), 86_400_000);
    const t = (d[20] as Candle).closeTime + 1000;
    const s = sliceUntil(d, t);
    expect(s[s.length - 1]?.openTime).toBe(d[20]?.openTime);
    expect(s.every((c) => c.closeTime <= t)).toBe(true);
  });
});

describe("Backtest com custos", () => {
  it("sem custos R líquido = R bruto; custos reduzem o R", () => {
    const cs = series([...Array(30).fill(100), 100, 101, 102, 104, 106, 108, 110, 112]);
    const sig = [{ index: 29, direction: "bullish" as const, stop: 95, target: 110, horizon: 20 }];
    const free = runSignals(cs, sig, "4h", { ...DEFAULT_COSTS, feeBps: 0, slippageBps: 0 });
    expect(free.trades).toHaveLength(1);
    expect(free.trades[0]?.outcome).toBe("win");
    expect(free.trades[0]?.rGross).toBeCloseTo(2, 6);
    expect(free.trades[0]?.rNet).toBeCloseTo(2, 6);
    const paid = runSignals(cs, sig, "4h", { ...DEFAULT_COSTS, feeBps: 10, slippageBps: 5, perp: true, fundingPct8h: 0.01 });
    const t = paid.trades[0]!;
    expect(t.rNet).toBeLessThan(t.rGross);
    expect(t.costR).toBeCloseTo(t.rGross - t.rNet, 9);
    expect(paid.finalReturnPct).toBeCloseTo(t.rNet, 6); // risco 1% × R
  });
  it("atraso que ultrapassa o alvo descarta o sinal; uma posição por vez", () => {
    const cs = series([...Array(30).fill(100), 100, 115, 116, 117, 118, 119, 120, 121]);
    const late = runSignals(cs, [{ index: 29, direction: "bullish", stop: 95, target: 110, horizon: 20 }], "4h", { ...DEFAULT_COSTS, entryDelay: 2 });
    expect(late.trades).toHaveLength(0);
    const flat = series(Array(80).fill(100).map((v, i) => v + (i % 2 ? 0.1 : -0.1)));
    const two = runSignals(flat, [{ index: 10, direction: "bullish", stop: 90, target: 130, horizon: 30 }, { index: 15, direction: "bullish", stop: 90, target: 130, horizon: 30 }], "4h", DEFAULT_COSTS);
    expect(two.trades).toHaveLength(1);
  });
  it("sinal de estratégia só na transição falso → verdadeiro", () => {
    const def: StrategyDefinition = definitionSchema.parse({ direction: "long", groups: [{ conditions: [{ tf: "4h", feature: "rsi", op: "<", value: 45 }] }], exit: { stop: "atr", atrMult: 1.5, rr: 2, horizon: 20 } });
    const cs = series(wave(420, 100, 10, 30, 0));
    const sigs = strategySignals(def, cs, {}, 200);
    expect(sigs.length).toBeGreaterThan(2);
    for (let i = 1; i < sigs.length; i++) expect(sigs[i]!.index - sigs[i - 1]!.index).toBeGreaterThan(1);
  });
});

describe("Market Monitor — alert engine", () => {
  const m = { id: "m1", states: ["READY", "TRIGGERED", "INVALIDATED", "TARGET_HIT"], minScore: 60, lastState: "FORMING" };
  it("notifica transição para estado monitorado com score mínimo; encerramento ignora o score", () => {
    expect(setupEventFor(m, { state: "READY", score: 65, direction: "bullish", entryLow: 100, triggeredAt: null })).not.toBeNull();
    expect(setupEventFor(m, { state: "READY", score: 55, direction: "bullish", entryLow: 100, triggeredAt: null })).toBeNull();
    expect(setupEventFor(m, { state: "INVALIDATED", score: 20, direction: "bullish", entryLow: 100, triggeredAt: null })).not.toBeNull();
    expect(setupEventFor({ ...m, lastState: "READY" }, { state: "READY", score: 80, direction: "bullish", entryLow: 100, triggeredAt: null })).toBeNull();
    expect(setupEventFor(m, { state: "ACTIVE", score: 80, direction: "bullish", entryLow: 100, triggeredAt: 1 })).toBeNull();
  });
  it("impressão digital: mesmo fato = mesma chave (dedup); zona diferente = outra chave", () => {
    const a = setupEventFor(m, { state: "READY", score: 65, direction: "bullish", entryLow: 100.0001, triggeredAt: null });
    const b = setupEventFor(m, { state: "READY", score: 90, direction: "bullish", entryLow: 100.0001, triggeredAt: null });
    const c = setupEventFor(m, { state: "READY", score: 65, direction: "bullish", entryLow: 104, triggeredAt: null });
    expect(a?.fingerprint).toBe(b?.fingerprint);
    expect(a?.fingerprint).not.toBe(c?.fingerprint);
    expect(fingerprintOf(["x", 1])).toHaveLength(40);
  });
});
