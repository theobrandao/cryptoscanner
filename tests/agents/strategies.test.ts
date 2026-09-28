import { describe, expect, it } from "vitest";
import { STRATEGIES, createStrategyContext, evaluateStrategies, listStrategies } from "@/agents/strategies";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { detectPatterns } from "@/lib/patterns/detect";
import { candlesFromCloses, syntheticSeries } from "../helpers";

function ctx(drift: number, fng = 50) {
  return createStrategyContext({
    symbol: "BTC",
    timeframe: "4h",
    getCandles: async (_s, tf) => candlesFromCloses(syntheticSeries(300, { drift, noise: 0.006, seed: tf.length })),
    snapshot: computeSnapshot,
    detectPatterns: (c) => detectPatterns(c, { minConfidence: 55 }),
    getSentiment: async () => ({
      symbol: "BTC",
      fearGreed: { value: fng, classification: "", classificationPt: "", timestamp: 1, source: "t", stale: false },
      news: [],
      newsScore: null,
      newsMethod: "none",
      overall: "neutral",
      confidence: 10,
      sources: [],
      explanation: "",
    }),
  });
}

describe("estratégias dos agentes do usuário", () => {
  it("lista estratégias com as quatro categorias", () => {
    const cats = new Set(listStrategies().map((s) => s.category));
    expect([...cats].sort()).toEqual(["cycles", "hybrid", "sentiment", "technical"]);
    expect(STRATEGIES.length).toBeGreaterThanOrEqual(12);
  });

  it("tendência por EMAs gera compra em série ascendente", async () => {
    const { signals, errors } = await evaluateStrategies(["ema_stack_trend"], ctx(0.004));
    expect(errors).toEqual([]);
    expect(signals[0]?.side).toBe("buy");
    expect(signals[0]?.confidence).toBeGreaterThanOrEqual(55);
  });

  it("extremos de medo & ganância são contrarian", async () => {
    const buy = await evaluateStrategies(["fear_greed_extremes"], ctx(0, 10));
    const sell = await evaluateStrategies(["fear_greed_extremes"], ctx(0, 90));
    expect(buy.signals[0]?.side).toBe("buy");
    expect(sell.signals[0]?.side).toBe("sell");
  });

  it("estratégia desconhecida vira erro sem interromper as demais", async () => {
    const { signals, errors } = await evaluateStrategies(["nao_existe", "ema_stack_trend"], ctx(0.004));
    expect(errors[0]?.strategy).toBe("nao_existe");
    expect(signals.length).toBe(1);
  });

  it("contexto memoiza candles por timeframe", async () => {
    let calls = 0;
    const c = createStrategyContext({
      symbol: "BTC",
      timeframe: "4h",
      getCandles: async () => {
        calls++;
        return candlesFromCloses(syntheticSeries(100));
      },
      snapshot: computeSnapshot,
      detectPatterns: () => [],
      getSentiment: async () => null,
    });
    await Promise.all([c.snapshot("4h"), c.candles("4h"), c.patterns("4h")]);
    expect(calls).toBe(1);
  });
});
