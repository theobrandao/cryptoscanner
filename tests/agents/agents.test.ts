import { describe, expect, it } from "vitest";
import { runAgent } from "@/agents/runtime";
import { marketAgent } from "@/agents/market-agent";
import { technicalAnalysisAgent, aggregateBias, buildSignals } from "@/agents/technical-analysis-agent";
import { trendAgent } from "@/agents/trend-agent";
import { riskAgent } from "@/agents/risk-agent";
import { sentimentAgent } from "@/agents/sentiment-agent";
import { scannerAgent } from "@/agents/scanner-agent";
import { orchestrate, finalize } from "@/agents/orchestrator";
import { createDefaultTools, type MarketTools, type SentimentTools } from "@/agents/tools";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { candlesFromCloses, syntheticSeries } from "../helpers";
import type { CandleSeries, Ticker, Timeframe } from "@/types/market";

function series(symbol: string, timeframe: Timeframe, drift = 0.003, stale = false): CandleSeries {
  return { symbol, timeframe, candles: candlesFromCloses(syntheticSeries(300, { drift, noise: 0.006, seed: symbol.length + timeframe.length })), source: "kraken", fetchedAt: Date.now(), stale };
}
const ticker = (symbol: string): Ticker => ({
  symbol,
  pair: `${symbol}USDT`,
  price: 100,
  changePct24h: 2,
  high24h: 105,
  low24h: 95,
  volume24h: 1000,
  quoteVolume24h: 5_000_000_000,
  updatedAt: Date.now(),
  source: "kraken",
});

function mockTools(opts: { drift?: number; stale?: boolean; failTicker?: boolean; failHigher?: boolean; fng?: number | null } = {}) {
  const market: MarketTools = {
    async getCandles(symbol, timeframe) {
      if (opts.failHigher && (timeframe === "1d" || timeframe === "1w")) throw new Error("superior indisponível");
      return series(symbol, timeframe, opts.drift, opts.stale);
    },
    async getTicker(symbol) {
      if (opts.failTicker) throw new Error("sem ticker");
      return ticker(symbol);
    },
    async getTickers() {
      return { tickers: ["BTC", "ETH"].map(ticker), source: "kraken", stale: false, fetchedAt: Date.now() };
    },
  };
  const sentiment: SentimentTools = {
    async fearGreed() {
      if (opts.fng === null) throw new Error("fng fora");
      return { data: { value: opts.fng ?? 75, classification: "Greed", classificationPt: "Ganância", timestamp: Date.now(), source: "alternative.me/fng", history: [] }, stale: false };
    },
    async news() {
      return { items: [{ title: "Bitcoin rally continues", link: "l1", source: "x", publishedAt: Date.now(), score: 1, matchedTerms: ["+rally"] }], stale: false, fetchedAt: Date.now() };
    },
  };
  return createDefaultTools({ market, sentiment });
}

describe("market-agent", () => {
  it("anota proveniência e qualidade", async () => {
    const r = await runAgent(marketAgent, { symbol: "btc", timeframe: "4h" }, { tools: mockTools() });
    expect(r.status).toBe("ok");
    expect(r.output!.symbol).toBe("BTC");
    expect(r.output!.provenance.source).toBe("kraken");
    expect(r.output!.quality.sufficientForIndicators).toBe(true);
    expect(r.output!.ticker?.symbol).toBe("BTC");
  });
  it("ticker ausente não invalida a série", async () => {
    const r = await runAgent(marketAgent, { symbol: "ETH", timeframe: "1h" }, { tools: mockTools({ failTicker: true }) });
    expect(r.status).toBe("ok");
    expect(r.output!.ticker).toBeNull();
  });
});

describe("technical-analysis-agent", () => {
  it("produz JSON estruturado com viés de alta em tendência de alta", async () => {
    const candles = series("BTC", "4h", 0.004).candles;
    const r = await runAgent(technicalAnalysisAgent, { symbol: "BTC", timeframe: "4h", candles }, { tools: mockTools() });
    expect(r.status).toBe("ok");
    const o = r.output!;
    expect(o.asset).toBe("BTC");
    expect(["bullish", "bearish", "neutral"]).toContain(o.trend);
    expect(o.bias).toBe("bullish");
    expect(o.confidence).toBeGreaterThan(0);
    expect(o.explanation).toContain("BTC 4h");
    expect(Array.isArray(o.support)).toBe(true);
  });
  it("agrega sinais por peso", () => {
    const agg = aggregateBias([
      { code: "a", label: "", direction: "bullish", weight: 3, detail: "" },
      { code: "b", label: "", direction: "bearish", weight: 1, detail: "" },
    ]);
    expect(agg.bias).toBe("bullish");
    expect(agg.score).toBeCloseTo(0.5);
    expect(buildSignals(computeSnapshot(series("BTC", "4h").candles)).length).toBeGreaterThan(3);
  });
});

describe("trend-agent", () => {
  it("mede alinhamento com o timeframe superior", async () => {
    const candles = series("BTC", "4h", 0.004).candles;
    const r = await runAgent(trendAgent, { symbol: "BTC", timeframe: "4h", candles }, { tools: mockTools({ drift: 0.004 }) });
    expect(r.status).toBe("ok");
    expect(r.output!.higher?.timeframe).toBe("1d");
    expect(r.output!.alignment).toBe("aligned");
    expect(r.output!.overall).toBe("bullish");
  });
  it("continua sem o timeframe superior", async () => {
    const candles = series("BTC", "4h", 0.004).candles;
    const r = await runAgent(trendAgent, { symbol: "BTC", timeframe: "4h", candles }, { tools: mockTools({ failHigher: true }) });
    expect(r.status).toBe("ok");
    expect(r.output!.higher).toBeNull();
    expect(r.output!.alignment).toBe("unknown");
  });
});

describe("risk-agent", () => {
  it("classifica risco e liquidez", async () => {
    const candles = series("BTC", "4h").candles;
    const r = await runAgent(riskAgent, { symbol: "BTC", timeframe: "4h", candles, ticker: ticker("BTC") }, { tools: mockTools() });
    expect(r.status).toBe("ok");
    expect(r.output!.liquidity.tier).toBe("high");
    expect(["low", "medium", "high", "extreme"]).toContain(r.output!.riskLevel);
    expect(r.output!.suggestedStopPct).toBeGreaterThan(0);
  });
  it("sem ticker a liquidez é desconhecida", async () => {
    const candles = series("BTC", "4h").candles;
    const r = await runAgent(riskAgent, { symbol: "BTC", timeframe: "4h", candles }, { tools: mockTools() });
    expect(r.output!.liquidity.tier).toBe("unknown");
  });
});

describe("sentiment-agent", () => {
  it("consolida F&G e manchetes com fontes", async () => {
    const r = await runAgent(sentimentAgent, { symbol: "BTC", useLlm: false }, { tools: mockTools({ fng: 80 }) });
    expect(r.status).toBe("ok");
    expect(r.output!.overall).toBe("positive");
    expect(r.output!.sources.length).toBeGreaterThan(0);
    expect(r.output!.newsMethod).toBe("lexicon");
  });
  it("fonte indisponível reduz confiança sem falhar", async () => {
    const r = await runAgent(sentimentAgent, { symbol: "BTC", useLlm: false }, { tools: mockTools({ fng: null }) });
    expect(r.status).toBe("ok");
    expect(r.output!.fearGreed).toBeNull();
  });
});

describe("scanner-agent", () => {
  it("varre vários ativos e tolera falhas individuais", async () => {
    const tools = mockTools();
    const original = (tools.market as MarketTools).getCandles;
    (tools.market as MarketTools).getCandles = async (s, tf, l) => {
      if (s === "DOGE") throw new Error("sem dados");
      return original(s, tf, l);
    };
    const r = await runAgent(scannerAgent, { symbols: ["BTC", "ETH", "DOGE"], timeframe: "4h", includeVolume: true }, { tools });
    expect(r.status).toBe("ok");
    expect(r.output!.rows.length).toBe(2);
    expect(r.output!.errors[0]!.symbol).toBe("DOGE");
    expect(r.output!.assetsAnalyzed).toBe(2);
    const row = r.output!.rows[0]!;
    expect(row).toHaveProperty("rsi14");
    expect(row).toHaveProperty("momentum");
    expect(row).toHaveProperty("signal");
  });
  it("filtra padrões por direção", async () => {
    const r = await runAgent(scannerAgent, { symbols: ["BTC"], timeframe: "1d", patternDirection: "bearish", minPatternConfidence: 0 }, { tools: mockTools() });
    for (const p of r.output!.rows.flatMap((x) => x.patterns)) expect(p.direction).toBe("bearish");
  });
});

describe("orchestrator", () => {
  it("consolida evidências e registra status de cada agente", async () => {
    const r = await orchestrate({ symbol: "BTC", timeframe: "4h", useLlm: false }, { tools: mockTools({ drift: 0.004, fng: 80 }) });
    expect(r.symbol).toBe("BTC");
    expect(Object.keys(r.agents)).toEqual(expect.arrayContaining(["market-agent", "technical-analysis-agent", "trend-agent", "risk-agent", "sentiment-agent"]));
    expect(r.evidence.length).toBeGreaterThanOrEqual(3);
    expect(r.verdict).toBe("bullish");
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.disclaimer).toMatch(/informativo/);
    expect(r.keyLevels.price).toBeGreaterThan(0);
  });

  it("reporta dados ausentes quando o mercado é obsoleto e sem ticker", async () => {
    const r = await orchestrate({ symbol: "ETH", timeframe: "4h", useLlm: false, includeSentiment: false }, { tools: mockTools({ stale: true, failTicker: true }) });
    expect(r.missingData.join(" ")).toMatch(/obsoletos/);
    expect(r.missingData.join(" ")).toMatch(/ticker/);
    expect(r.outputs.sentiment).toBeNull();
  });

  it("detecta conflito técnica × tendência e reduz a confiança", () => {
    const base = finalize({
      executionId: "x",
      input: { symbol: "BTC", timeframe: "4h", includeSentiment: false, useLlm: false, minPatternConfidence: 60 },
      t0: Date.now(),
      now: Date.now(),
      agents: {},
      missingData: [],
      outputs: {
        market: null,
        technical: {
          asset: "BTC",
          timeframe: "4h",
          trend: "bullish",
          momentum: "up",
          support: [90],
          resistance: [110],
          signals: [{ code: "a", label: "", direction: "bullish", weight: 3, detail: "" }],
          patterns: [],
          indicators: computeSnapshot(series("BTC", "4h").candles),
          confidence: 80,
          bias: "bullish",
          explanation: "",
        },
        trend: {
          symbol: "BTC",
          primary: { timeframe: "4h", trend: "bearish", strength: 70, emaStack: "bearish", slopePct: -0.1 },
          higher: null,
          alignment: "unknown",
          overall: "bearish",
          confidence: 70,
          explanation: "",
        },
        risk: null,
        sentiment: null,
      },
    });
    expect(base.conflicts.some((c) => c.code === "ta_vs_trend")).toBe(true);
    expect(base.confidence).toBeLessThan(75);
    expect(base.riskLevel).toBe("unknown");
  });

  it("falha limpa quando nenhum provedor responde", async () => {
    const tools = mockTools();
    (tools.market as MarketTools).getCandles = async () => {
      throw new Error("tudo fora");
    };
    const r = await orchestrate({ symbol: "BTC", timeframe: "4h", useLlm: false }, { tools });
    expect(r.verdict).toBe("neutral");
    expect(r.missingData[0]).toMatch(/nenhum provedor/);
    expect(r.agents["market-agent"]?.status).toBe("error");
  });
});
