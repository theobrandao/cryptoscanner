import { afterEach, describe, expect, it, vi } from "vitest";
import { parseKlines, parseTicker24h } from "@/services/market/providers/binance";
import { normalizeKrakenKey, parseOhlc } from "@/services/market/providers/kraken";
import { ProviderError, createLimiter, type MarketProvider } from "@/services/market/providers/types";
import { getCandles, getTickers, setProvidersForTests } from "@/services/market/market-service";
import { getCache } from "@/lib/cache";
import { ASSETS } from "@/lib/assets";
import { candlesFromCloses, syntheticSeries } from "../helpers";
import type { Ticker } from "@/types/market";

const btc = ASSETS[0]!;

function fakeProvider(name: "binance" | "kraken", behavior: { candles?: "ok" | "fail451" | "fail"; tickers?: "ok" | "fail" }): MarketProvider {
  return {
    name,
    async ping() {},
    async getCandles() {
      if (behavior.candles === "fail451") throw new ProviderError(name, "indisponível nesta região (HTTP 451)", 451);
      if (behavior.candles === "fail") throw new ProviderError(name, "rede");
      return candlesFromCloses(syntheticSeries(320, { seed: name === "binance" ? 1 : 2 }));
    },
    async getTickers(assets) {
      if (behavior.tickers === "fail") throw new ProviderError(name, "rede");
      return assets.map<Ticker>((a) => ({
        symbol: a.symbol,
        pair: a.binancePair,
        price: 100,
        changePct24h: 1,
        high24h: 101,
        low24h: 99,
        volume24h: 10,
        quoteVolume24h: 1000,
        updatedAt: Date.now(),
        source: name,
      }));
    },
  };
}

describe("parsers dos provedores", () => {
  it("binance klines → candles normalizados", () => {
    const c = parseKlines([[1700000000000, "1", "2", "0.5", "1.5", "100", 1700003599999, "150", 10, "50", "75", "0"]]);
    expect(c[0]).toMatchObject({ openTime: 1700000000000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, closeTime: 1700003599999, quoteVolume: 150 });
  });
  it("binance ticker 24h", () => {
    const t = parseTicker24h({ symbol: "BTCUSDT", lastPrice: "100", priceChangePercent: "2.5", highPrice: "110", lowPrice: "90", volume: "5", quoteVolume: "500", closeTime: 1 }, btc);
    expect(t.symbol).toBe("BTC");
    expect(t.changePct24h).toBe(2.5);
    expect(t.source).toBe("binance");
  });
  it("kraken OHLC → candles com closeTime derivado do timeframe", () => {
    const c = parseOhlc([[1700000000, "1", "2", "0.5", "1.5", "1.2", "100", 5]], "4h");
    expect(c[0]!.openTime).toBe(1700000000000);
    expect(c[0]!.closeTime).toBe(1700000000000 + 4 * 3600_000 - 1);
    expect(c[0]!.quoteVolume).toBeCloseTo(120);
  });
  it("normaliza chaves legadas da kraken", () => {
    expect(normalizeKrakenKey("XXBTZUSD")).toBe("XBTUSD");
    expect(normalizeKrakenKey("XETHZUSD")).toBe("ETHUSD");
    expect(normalizeKrakenKey("XZECZUSD")).toBe("ZECUSD");
    expect(normalizeKrakenKey("XXDGZUSD")).toBe("XDGUSD");
    expect(normalizeKrakenKey("SOLUSD")).toBe("SOLUSD");
    expect(normalizeKrakenKey("XDGUSD")).toBe("XDGUSD");
  });
  it("limiter respeita a concorrência", async () => {
    const run = createLimiter(2, 0);
    let active = 0;
    let max = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        run(async () => {
          active++;
          max = Math.max(max, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe("fallback entre provedores", () => {
  afterEach(() => {
    setProvidersForTests(null);
    getCache()._clearMemory();
    vi.restoreAllMocks();
  });

  it("usa o segundo provedor quando o primeiro responde 451", async () => {
    setProvidersForTests([fakeProvider("binance", { candles: "fail451" }), fakeProvider("kraken", { candles: "ok" })]);
    const s = await getCandles("BTC", "4h", { limit: 100, refresh: true });
    expect(s.source).toBe("kraken");
    expect(s.candles.length).toBe(100);
    expect(s.stale).toBe(false);
  });

  it("usa o primeiro provedor quando disponível", async () => {
    setProvidersForTests([fakeProvider("binance", { candles: "ok" }), fakeProvider("kraken", { candles: "ok" })]);
    const s = await getCandles("ETH", "1d", { refresh: true });
    expect(s.source).toBe("binance");
  });

  it("devolve última coleta (stale) quando todos falham", async () => {
    setProvidersForTests([fakeProvider("binance", { candles: "ok" }), fakeProvider("kraken", { candles: "ok" })]);
    await getCandles("SOL", "1h", { refresh: true });
    setProvidersForTests([fakeProvider("binance", { candles: "fail" }), fakeProvider("kraken", { candles: "fail" })]);
    const s = await getCandles("SOL", "1h", { refresh: true });
    expect(s.stale).toBe(true);
    expect(s.candles.length).toBeGreaterThan(0);
  });

  it("lança erro claro quando não há cache nem provedor", async () => {
    setProvidersForTests([fakeProvider("kraken", { candles: "fail" })]);
    await expect(getCandles("DOGE", "1w", { refresh: true })).rejects.toThrow(/Todos os provedores falharam/);
  });

  it("tickers com fallback", async () => {
    setProvidersForTests([fakeProvider("binance", { tickers: "fail" }), fakeProvider("kraken", { tickers: "ok" })]);
    const t = await getTickers({ refresh: true });
    expect(t.source).toBe("kraken");
    expect(t.tickers.length).toBe(ASSETS.length);
  });

  it("rejeita ativo desconhecido", async () => {
    await expect(getCandles("XYZ", "4h")).rejects.toThrow(/desconhecido/);
  });
});

describe("binance: bases REST com fallback regional", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cai para data-api.binance.vision quando api.binance.com responde 451 e memoriza o bloqueio", async () => {
    const { binanceProvider, binanceBases, resetBinanceBases } = await import("@/services/market/providers/binance");
    resetBinanceBases();
    expect(binanceBases()).toEqual(["https://api.binance.com", "https://data-api.binance.vision"]);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.startsWith("https://api.binance.com")) return new Response("{}", { status: 451, headers: { "content-type": "application/json" } });
        const kline = [1790611200000, "1", "2", "0.5", "1.5", "10", 1790625599999, "15", 5, "5", "7", "0"];
        return new Response(JSON.stringify([kline, kline]), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const candles = await binanceProvider.getCandles(btc, "4h", 50);
    expect(candles).toHaveLength(2);
    expect(calls.some((u) => u.startsWith("https://api.binance.com"))).toBe(true);
    expect(calls.at(-1)?.startsWith("https://data-api.binance.vision")).toBe(true);
    // segunda chamada: a base bloqueada é pulada
    calls.length = 0;
    await binanceProvider.getCandles(btc, "4h", 50);
    expect(calls.every((u) => u.startsWith("https://data-api.binance.vision"))).toBe(true);
    resetBinanceBases();
  });

  it("não troca de base em erro de parâmetro (400)", async () => {
    const { binanceProvider, resetBinanceBases } = await import("@/services/market/providers/binance");
    resetBinanceBases();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response('{"code":-1121}', { status: 400, headers: { "content-type": "application/json" } });
      }),
    );
    await expect(binanceProvider.getCandles(btc, "4h", 50)).rejects.toBeInstanceOf(ProviderError);
    expect(calls.every((u) => u.startsWith("https://api.binance.com"))).toBe(true);
    resetBinanceBases();
  });
});
