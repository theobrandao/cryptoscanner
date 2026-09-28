import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sem contexto de requisição do Next.js, `connection()` é neutralizado nos testes de rota.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: async () => undefined };
});

import { getCache } from "@/lib/cache";
import { ASSETS } from "@/lib/assets";
import { setProvidersForTests } from "@/services/market/market-service";
import { ProviderError, type MarketProvider } from "@/services/market/providers/types";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { candlesFromCloses, syntheticSeries } from "../helpers";
import type { Ticker } from "@/types/market";

function provider(name: "binance" | "kraken", ok = true): MarketProvider {
  return {
    name,
    async ping() {
      if (!ok) throw new ProviderError(name, "HTTP 451", 451);
    },
    async getCandles(asset, tf) {
      if (!ok) throw new ProviderError(name, "HTTP 451", 451);
      return candlesFromCloses(syntheticSeries(320, { seed: asset.symbol.length + tf.length, drift: 0.002 }));
    },
    async getTickers(assets) {
      if (!ok) throw new ProviderError(name, "HTTP 451", 451);
      return assets.map<Ticker>((a) => ({
        symbol: a.symbol,
        pair: a.binancePair,
        price: 100,
        changePct24h: 1,
        high24h: 101,
        low24h: 99,
        volume24h: 10,
        quoteVolume24h: 1e9,
        updatedAt: Date.now(),
        source: name,
      }));
    },
  };
}

const json = async (res: Response) => (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };

describe("rotas da API", () => {
  beforeEach(() => {
    setProvidersForTests([provider("binance", false), provider("kraken", true)]);
    getCache()._clearMemory();
  });
  afterEach(() => setProvidersForTests(null));

  it("GET /api/health informa provedores, banco e IA", async () => {
    const { GET } = await import("@/app/api/health/route");
    const body = await json(await GET(new Request("http://localhost/api/health"), { params: Promise.resolve({}) }));
    expect(body.ok).toBe(true);
    const data = body.data as { database: { configured: boolean }; providers: Array<{ provider: string; ok: boolean }>; llm: { configured: boolean } };
    expect(data.database.configured).toBe(false);
    expect(data.providers.find((p) => p.provider === "binance")?.ok).toBe(false);
    expect(data.providers.find((p) => p.provider === "kraken")?.ok).toBe(true);
    expect(data.llm.configured).toBe(false);
  });

  it("GET /api/market/assets devolve universo e catálogo", async () => {
    const { GET } = await import("@/app/api/market/assets/route");
    const body = await json(await GET(new Request("http://localhost/api/market/assets"), { params: Promise.resolve({}) }));
    expect((body.data!.assets as unknown[]).length).toBe(ASSETS.length);
    expect((body.data!.patterns as unknown[]).length).toBe(17);
  });

  it("GET /api/market/candles valida parâmetros e retorna indicadores", async () => {
    const { GET } = await import("@/app/api/market/candles/route");
    const bad = await json(await GET(new Request("http://localhost/api/market/candles?symbol=NOPE"), { params: Promise.resolve({}) }));
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("validation");
    const good = await json(await GET(new Request("http://localhost/api/market/candles?symbol=btc&timeframe=7d&limit=100&indicators=1"), { params: Promise.resolve({}) }));
    expect(good.ok).toBe(true);
    expect(good.data!.timeframe).toBe("1w");
    expect((good.data!.candles as unknown[]).length).toBe(100);
    expect(good.data!.source).toBe("kraken");
    expect((good.data!.series as { ema8: unknown[] }).ema8.length).toBe(100);
  });

  it("GET /api/market/tickers cai para o provedor disponível", async () => {
    const { GET } = await import("@/app/api/market/tickers/route");
    const body = await json(await GET(new Request("http://localhost/api/market/tickers"), { params: Promise.resolve({}) }));
    expect(body.ok).toBe(true);
    expect(body.data!.source).toBe("kraken");
    expect((body.data!.tickers as unknown[]).length).toBe(ASSETS.length);
  });

  it("GET /api/scanner/table bloqueia timeframe de alta frequência para visitante", async () => {
    const { GET } = await import("@/app/api/scanner/table/route");
    const blocked = await json(await GET(new Request("http://localhost/api/scanner/table?timeframe=1h"), { params: Promise.resolve({}) }));
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("plan_required");
    const ok = await json(await GET(new Request("http://localhost/api/scanner/table?timeframe=4h"), { params: Promise.resolve({}) }));
    expect(ok.ok).toBe(true);
    expect((ok.data!.rows as unknown[]).length).toBe(ASSETS.length);
  });

  it("GET /api/scanner/table libera 1h com sessão PLATINUM", async () => {
    const { GET } = await import("@/app/api/scanner/table/route");
    const token = await createSessionToken({ id: "u1", email: "a@b.c", name: "A", plan: "PLATINUM", role: "USER" });
    const res = await GET(new Request("http://localhost/api/scanner/table?timeframe=1h", { headers: { cookie: `${SESSION_COOKIE}=${token}` } }), { params: Promise.resolve({}) });
    expect((await json(res)).ok).toBe(true);
  });

  it("POST /api/scanner/run valida o corpo e executa o scan", async () => {
    const { POST } = await import("@/app/api/scanner/run/route");
    const bad = await json(await POST(new Request("http://localhost/api/scanner/run", { method: "POST", body: "{" }), { params: Promise.resolve({}) }));
    expect(bad.error?.code).toBe("invalid_json");
    const res = await POST(
      new Request("http://localhost/api/scanner/run", { method: "POST", body: JSON.stringify({ timeframe: "1d", direction: "bullish", symbols: ["BTC", "ETH"], includeVolume: false }) }),
      { params: Promise.resolve({}) },
    );
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect((body.data!.rows as unknown[]).length).toBe(2);
    for (const p of (body.data!.rows as Array<{ patterns: Array<{ direction: string }> }>).flatMap((r) => r.patterns)) expect(p.direction).toBe("bullish");
  });

  it("GET /api/analysis executa o orquestrador (sem LLM, sem banco)", async () => {
    const { GET } = await import("@/app/api/analysis/route");
    const body = await json(await GET(new Request("http://localhost/api/analysis?symbol=ETH&timeframe=4h&sentiment=0&llm=0"), { params: Promise.resolve({}) }));
    expect(body.ok).toBe(true);
    expect(body.data!.symbol).toBe("ETH");
    expect(body.data!.llmNarrative).toBeNull();
    expect(body.data!.outputs).toBeDefined();
  });

  it("rotas que exigem banco respondem 503 sem DATABASE_URL", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email: "alguem@exemplo.com", password: "x" }) }), { params: Promise.resolve({}) });
    expect(res.status).toBe(503);
    expect((await json(res)).error?.code).toBe("database_unavailable");
  });

  it("rotas autenticadas respondem 401 sem sessão", async () => {
    const { GET } = await import("@/app/api/watchlist/route");
    const res = await GET(new Request("http://localhost/api/watchlist"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("POST /api/analysis/chart-image exige login e provedor de IA", async () => {
    const { POST } = await import("@/app/api/analysis/chart-image/route");
    const anon = await POST(new Request("http://localhost/api/analysis/chart-image", { method: "POST" }), { params: Promise.resolve({}) });
    expect(anon.status).toBe(401);
    const token = await createSessionToken({ id: "u1", email: "a@b.c", name: "A", plan: "FREE", role: "USER" });
    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "c.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost/api/analysis/chart-image", { method: "POST", body: form, headers: { cookie: `${SESSION_COOKIE}=${token}` } }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(503);
    expect((await json(res)).error?.code).toBe("llm_unavailable");
  });

  it("GET /api/fibonacci manual e automático", async () => {
    const { GET } = await import("@/app/api/fibonacci/route");
    const manual = await json(await GET(new Request("http://localhost/api/fibonacci?high=200&low=100&direction=up"), { params: Promise.resolve({}) }));
    expect(manual.data!.mode).toBe("manual");
    const auto = await json(await GET(new Request("http://localhost/api/fibonacci?symbol=BTC&timeframe=1d"), { params: Promise.resolve({}) }));
    expect(auto.data!.mode).toBe("auto");
    expect((auto.data!.result as { levels: unknown[] }).levels.length).toBe(12);
  });

  it("GET /api/agents/definitions documenta os agentes", async () => {
    const { GET } = await import("@/app/api/agents/definitions/route");
    const body = await json(await GET(new Request("http://localhost/api/agents/definitions"), { params: Promise.resolve({}) }));
    const agents = body.data!.agents as Array<{ name: string; allowedTools: string[]; timeoutMs: number }>;
    expect(agents.map((a) => a.name)).toEqual(["scanner-agent", "market-agent", "technical-analysis-agent", "trend-agent", "risk-agent", "sentiment-agent", "orchestrator-agent"]);
    for (const a of agents) expect(a.timeoutMs).toBeGreaterThan(0);
  });

  it("GET /api/stream/tickers emite eventos SSE e encerra ao abortar", async () => {
    const { GET } = await import("@/app/api/stream/tickers/route");
    const controller = new AbortController();
    const res = await GET(new Request("http://localhost/api/stream/tickers", { signal: controller.signal }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("event: tickers")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain("event: hello");
    expect(text).toContain("event: tickers");
    controller.abort();
  });
});

describe("sessão JWT", () => {
  it("assina e verifica o token; rejeita token adulterado", async () => {
    const user = { id: "u1", email: "a@b.c", name: "A", plan: "PRO" as const, role: "USER" as const };
    const token = await createSessionToken(user);
    expect(await verifySessionToken(token)).toEqual(user);
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
  });
});
