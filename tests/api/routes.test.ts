import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sem contexto de requisição do Next.js, `connection()` é neutralizado nos testes de rota.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: async () => undefined };
});

import { getCache } from "@/lib/cache";
import { resetEnvCache } from "@/lib/env";
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

/** Sessão com acesso ao produto (sem banco, só ADMIN passa na checagem de plano). */
async function planHeaders(): Promise<Record<string, string>> {
  const token = await createSessionToken({ id: "adm", email: "adm@b.c", name: "Adm", plan: "PLATINUM", role: "ADMIN" });
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

const json = async (res: Response) => (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };

describe("rotas da API", () => {
  beforeEach(() => {
    setProvidersForTests([provider("binance", false), provider("kraken", true)]);
    getCache()._clearMemory();
  });
  afterEach(() => setProvidersForTests(null));

  it("GET /api/health: público mínimo; detalhe só com x-health-secret", async () => {
    const { GET } = await import("@/app/api/health/route");
    const pub = await GET(new Request("http://localhost/api/health"), { params: Promise.resolve({}) });
    expect(pub.headers.get("cache-control")).toBe("no-store");
    const p = (await json(pub)).data as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["commit", "database", "llm", "status"]);
    expect(p.database).toEqual({ ok: false });
    expect(p.providers).toBeUndefined();
    process.env.CRON_SECRET = "segredo-do-monitoramento-123";
    resetEnvCache();
    try {
      const wrong = (await json(await GET(new Request("http://localhost/api/health", { headers: { "x-health-secret": "errado" } }), { params: Promise.resolve({}) }))).data as Record<string, unknown>;
      expect(wrong.providers).toBeUndefined();
      const body = await json(await GET(new Request("http://localhost/api/health", { headers: { "x-health-secret": "segredo-do-monitoramento-123" } }), { params: Promise.resolve({}) }));
      expect(body.ok).toBe(true);
      const data = body.data as { database: { configured: boolean }; providers: Array<{ provider: string; ok: boolean }>; llm: { configured: boolean } };
      expect(data.database.configured).toBe(false);
      expect(data.providers.find((p) => p.provider === "binance")?.ok).toBe(false);
      expect(data.providers.find((p) => p.provider === "kraken")?.ok).toBe(true);
      expect(data.llm.configured).toBe(false);
    } finally {
      delete process.env.CRON_SECRET;
      resetEnvCache();
    }
  });

  it("GET /api/market/assets devolve universo e catálogo", async () => {
    const { GET } = await import("@/app/api/market/assets/route");
    const body = await json(await GET(new Request("http://localhost/api/market/assets"), { params: Promise.resolve({}) }));
    expect((body.data!.assets as unknown[]).length).toBe(ASSETS.length);
    expect((body.data!.patterns as unknown[]).length).toBe(17);
  });

  it("GET /api/market/candles valida parâmetros e retorna indicadores", async () => {
    const { GET } = await import("@/app/api/market/candles/route");
    const anon = await GET(new Request("http://localhost/api/market/candles?symbol=btc"), { params: Promise.resolve({}) });
    expect(anon.status).toBe(401);
    const h = await planHeaders();
    const bad = await json(await GET(new Request("http://localhost/api/market/candles?symbol=NOPE", { headers: h }), { params: Promise.resolve({}) }));
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("validation");
    const good = await json(await GET(new Request("http://localhost/api/market/candles?symbol=btc&timeframe=7d&limit=100&indicators=1", { headers: h }), { params: Promise.resolve({}) }));
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

  it("GET /api/scanner/table exige conta com plano (visitante 401, conta sem plano 402)", async () => {
    const { GET } = await import("@/app/api/scanner/table/route");
    const anon = await GET(new Request("http://localhost/api/scanner/table?timeframe=4h"), { params: Promise.resolve({}) });
    expect(anon.status).toBe(401);
    const noPlan = await createSessionToken({ id: "u2", email: "c@d.e", name: "C", plan: "FREE", role: "USER" });
    const blocked = await GET(new Request("http://localhost/api/scanner/table?timeframe=4h", { headers: { cookie: `${SESSION_COOKIE}=${noPlan}` } }), { params: Promise.resolve({}) });
    expect(blocked.status).toBe(402);
    expect((await json(blocked)).error?.code).toBe("subscription_required");
    const ok = await json(await GET(new Request("http://localhost/api/scanner/table?timeframe=4h", { headers: await planHeaders() }), { params: Promise.resolve({}) }));
    expect(ok.ok).toBe(true);
    expect((ok.data!.rows as unknown[]).length).toBe(ASSETS.length);
  });

  it("GET /api/scanner/table libera 1h com sessão PLATINUM", async () => {
    const { GET } = await import("@/app/api/scanner/table/route");
    const res = await GET(new Request("http://localhost/api/scanner/table?timeframe=1h", { headers: await planHeaders() }), { params: Promise.resolve({}) });
    expect((await json(res)).ok).toBe(true);
  });

  it("POST /api/scanner/run valida o corpo e executa o scan", async () => {
    const { POST } = await import("@/app/api/scanner/run/route");
    const h = await planHeaders();
    const bad = await json(await POST(new Request("http://localhost/api/scanner/run", { method: "POST", body: "{", headers: h }), { params: Promise.resolve({}) }));
    expect(bad.error?.code).toBe("invalid_json");
    const res = await POST(
      new Request("http://localhost/api/scanner/run", { method: "POST", headers: h, body: JSON.stringify({ timeframe: "1d", direction: "bullish", symbols: ["BTC", "ETH"], includeVolume: false }) }),
      { params: Promise.resolve({}) },
    );
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect((body.data!.rows as unknown[]).length).toBe(2);
    for (const p of (body.data!.rows as Array<{ patterns: Array<{ direction: string }> }>).flatMap((r) => r.patterns)) expect(p.direction).toBe("bullish");
  });

  it("GET /api/analysis executa o orquestrador (sem LLM, sem banco)", async () => {
    const { GET } = await import("@/app/api/analysis/route");
    const body = await json(await GET(new Request("http://localhost/api/analysis?symbol=ETH&timeframe=4h&sentiment=0&llm=0", { headers: await planHeaders() }), { params: Promise.resolve({}) }));
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

  it("POST /api/auth/register recusa cadastro por senha com e-mail do dono (só Google)", async () => {
    const saved = process.env.OWNER_EMAILS;
    process.env.OWNER_EMAILS = "dono@example.com";
    resetEnvCache();
    try {
      const { POST } = await import("@/app/api/auth/register/route");
      const res = await POST(new Request("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Intruso", email: "Dono@Example.com", password: "SenhaForte#2026", acceptTerms: true }) }), { params: Promise.resolve({}) });
      expect(res.status).toBe(403);
      const body = await json(res);
      expect(body.error?.code).toBe("owner_use_google");
      expect(body.error?.message).toBe("Para esta conta, entre com o Google.");
    } finally {
      if (saved === undefined) delete process.env.OWNER_EMAILS;
      else process.env.OWNER_EMAILS = saved;
      resetEnvCache();
    }
  });

  it("POST /api/auth/register e /login validam com os schemas em português (lib/validation/auth.ts)", async () => {
    const { AUTH_MESSAGES } = await import("@/lib/validation/auth-messages");
    const register = await import("@/app/api/auth/register/route");
    const r = await register.POST(new Request("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify({ name: "A", email: "x@example.com", password: "abcdefgh", acceptTerms: false }) }), { params: Promise.resolve({}) });
    expect(r.status).toBe(400);
    const rb = JSON.stringify(await r.json());
    for (const m of [AUTH_MESSAGES.nameShort, AUTH_MESSAGES.passwordLettersNumbers, AUTH_MESSAGES.termsRequired]) expect(rb).toContain(m);
    const login = await import("@/app/api/auth/login/route");
    const l = await login.POST(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "x-forwarded-for": "10.9.8.7" }, body: JSON.stringify({ email: "nao-e-email", password: "" }) }), { params: Promise.resolve({}) });
    expect(l.status).toBe(400);
    const lb = JSON.stringify(await l.json());
    for (const m of [AUTH_MESSAGES.emailInvalid, AUTH_MESSAGES.passwordRequired]) expect(lb).toContain(m);
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
    const noPlan = await createSessionToken({ id: "u1", email: "a@b.c", name: "A", plan: "FREE", role: "USER" });
    const blocked = await POST(new Request("http://localhost/api/analysis/chart-image", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${noPlan}` } }), { params: Promise.resolve({}) });
    expect(blocked.status).toBe(402);
    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "c.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost/api/analysis/chart-image", { method: "POST", body: form, headers: await planHeaders() }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(503);
    expect((await json(res)).error?.code).toBe("llm_unavailable");
  });

  it("GET /api/fibonacci manual e automático", async () => {
    const { GET } = await import("@/app/api/fibonacci/route");
    expect((await GET(new Request("http://localhost/api/fibonacci?high=200&low=100&direction=up"), { params: Promise.resolve({}) })).status).toBe(401);
    const h = await planHeaders();
    const manual = await json(await GET(new Request("http://localhost/api/fibonacci?high=200&low=100&direction=up", { headers: h }), { params: Promise.resolve({}) }));
    expect(manual.data!.mode).toBe("manual");
    const auto = await json(await GET(new Request("http://localhost/api/fibonacci?symbol=BTC&timeframe=1d", { headers: h }), { params: Promise.resolve({}) }));
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
    expect(await verifySessionToken(token)).toMatchObject(user);
    expect(typeof (await verifySessionToken(token))?.iat).toBe("number");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
  });
});

// ------------------------------------------------------------------ acesso por plano com banco simulado (Frente 5)
describe("acesso: requireCoreUser/requireEntitlement com assinatura real", () => {
  const DAY = 86_400_000;
  type SubRow = { id: string; plan: string; status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; provider: string | null };
  const sub = (s: Partial<SubRow>): SubRow => ({ id: "s1", plan: "PRO", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 10 * DAY), cancelAtPeriodEnd: false, provider: "kiwify", ...s });
  const writes: string[] = [];

  function fakeDb(row: { role?: "USER" | "ADMIN"; plan?: "FREE" | "PRO" | "PLATINUM"; blockedAt?: Date | null; subscription: SubRow | null; agent?: Record<string, unknown> }) {
    const user = { id: "u-acesso", email: "acesso@example.com", name: "Acesso", role: row.role ?? "USER", plan: row.plan ?? "PRO", passwordChangedAt: null, blockedAt: row.blockedAt ?? null, subscription: row.subscription };
    process.env.DATABASE_URL = "postgresql://teste/nao-conecta";
    resetEnvCache();
    globalThis.__cryptoscannerPrisma = {
      user: {
        findUnique: async () => user,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(`user:${JSON.stringify(data)}`);
          return { ...user, ...data };
        },
      },
      subscription: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(`subscription:${JSON.stringify(data)}`);
          return { ...row.subscription, ...data };
        },
        upsert: async () => row.subscription,
      },
      monitor: { findFirst: async () => null },
      agent: {
        findFirst: async () => row.agent ?? null,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(`agent:${JSON.stringify(data)}`);
          return { ...row.agent, ...data };
        },
      },
    } as unknown as NonNullable<typeof globalThis.__cryptoscannerPrisma>;
    return user;
  }

  async function reqFor(url = "http://localhost/api/x", init: RequestInit = {}) {
    const token = await createSessionToken({ id: "u-acesso", email: "acesso@example.com", name: "Acesso", plan: "PRO", role: "USER" });
    return new Request(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: `${SESSION_COOKIE}=${token}` } });
  }

  async function errOf(p: Promise<unknown>): Promise<{ status: number; code: string }> {
    try {
      await p;
    } catch (err) {
      return err as { status: number; code: string };
    }
    throw new Error("esperava erro");
  }

  beforeEach(() => writes.splice(0));
  afterEach(() => {
    globalThis.__cryptoscannerPrisma = undefined;
    process.env.DATABASE_URL = "";
    resetEnvCache();
  });

  it("teste de 3 dias expirado → 402 subscription_required (e o status é gravado na transição)", async () => {
    fakeDb({ subscription: sub({ status: "TRIALING", trialEndsAt: new Date(Date.now() - DAY), currentPeriodEnd: null }) });
    const { requireCoreUser } = await import("@/services/subscription-service");
    expect(await errOf(requireCoreUser(await reqFor()))).toMatchObject({ status: 402, code: "subscription_required" });
    expect(writes).toContain('subscription:{"status":"EXPIRED"}');
  });

  it("teste ativo → acesso TRIAL com 4H/1D/1W, sem 1H", async () => {
    fakeDb({ subscription: sub({ status: "TRIALING", trialEndsAt: new Date(Date.now() + DAY), currentPeriodEnd: null }) });
    const { requireCoreUser } = await import("@/services/subscription-service");
    const u = await requireCoreUser(await reqFor());
    expect(u.access.tier).toBe("TRIAL");
    expect(u.access.entitlements.timeframes).toEqual(["4h", "1d", "1w"]);
    expect(u.plan).toBe("PRO");
  });

  it("PAST_DUE dentro da carência mantém o PRO; fora da carência → 402", async () => {
    fakeDb({ subscription: sub({ status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - DAY) }) });
    const { requireCoreUser, requireEntitlement } = await import("@/services/subscription-service");
    const u = await requireCoreUser(await reqFor());
    expect(u.access.tier).toBe("PRO");
    expect(await errOf(requireEntitlement(u, "elite"))).toMatchObject({ status: 402, code: "elite_required" });
    fakeDb({ subscription: sub({ status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 10 * DAY) }) });
    expect(await errOf(requireCoreUser(await reqFor()))).toMatchObject({ status: 402, code: "subscription_required" });
  });

  it("conta bloqueada → 403 account_blocked, mesmo com assinatura ativa", async () => {
    fakeDb({ blockedAt: new Date(), subscription: sub({ plan: "ELITE" }) });
    const { requireCoreUser } = await import("@/services/subscription-service");
    expect(await errOf(requireCoreUser(await reqFor()))).toMatchObject({ status: 403, code: "account_blocked" });
  });

  it("ELITE ativo recebe 1H; plano legado é sincronizado para a chave interna", async () => {
    fakeDb({ plan: "PRO", subscription: sub({ plan: "ELITE" }) });
    const { requireCoreUser } = await import("@/services/subscription-service");
    const u = await requireCoreUser(await reqFor());
    expect(u.access.tier).toBe("ELITE");
    expect(u.access.entitlements.timeframes).toContain("1h");
    expect(u.plan).toBe("PLATINUM");
    expect(writes).toContain('user:{"plan":"PLATINUM"}');
  });

  it("PRO pede 1H: scanner, monitor e analista respondem 403 plan_required (mesma regra)", async () => {
    fakeDb({ subscription: sub({ plan: "PRO" }) });
    const table = await import("@/app/api/scanner/table/route");
    const t = await table.GET(await reqFor("http://localhost/api/scanner/table?timeframe=1h"), { params: Promise.resolve({}) });
    expect(t.status).toBe(403);
    expect((await json(t)).error?.code).toBe("plan_required");
    const monitors = await import("@/app/api/monitors/route");
    const m = await monitors.POST(await reqFor("http://localhost/api/monitors", { method: "POST", body: JSON.stringify({ symbol: "BTC", timeframe: "1h" }) }), { params: Promise.resolve({}) });
    expect(m.status).toBe(403);
    expect((await json(m)).error?.code).toBe("plan_required");
    const analyst = await import("@/app/api/markets/[symbol]/analyst/route");
    const a = await analyst.POST(await reqFor("http://localhost/api/markets/BTC/analyst", { method: "POST", body: JSON.stringify({ tf: "30m", llm: false }) }), { params: Promise.resolve({ symbol: "BTC" }) });
    expect(a.status).toBe(403);
    expect((await json(a)).error?.message).toBe("Timeframe 30M disponível apenas no plano ELITE.");
  });

  it("PRO muda agente para 1H ou reativa agente/Sentinela em 1H → 403 plan_required, sem gravar", async () => {
    const patch = (body: unknown) => ({ method: "PATCH", body: JSON.stringify(body) });
    fakeDb({ subscription: sub({ plan: "PRO" }), agent: { id: "ag1", userId: "u-acesso", kind: "agent", timeframe: "4h", status: "PAUSED" } });
    const agents = await import("@/app/api/agents/[id]/route");
    const a = await agents.PATCH(await reqFor("http://localhost/api/agents/ag1", patch({ timeframe: "1h" })), { params: Promise.resolve({ id: "ag1" }) });
    expect(a.status).toBe(403);
    expect((await json(a)).error?.code).toBe("plan_required");
    const ok4h = await agents.PATCH(await reqFor("http://localhost/api/agents/ag1", patch({ timeframe: "1d" })), { params: Promise.resolve({ id: "ag1" }) });
    expect(ok4h.status).toBe(200);
    fakeDb({ subscription: sub({ plan: "PRO" }), agent: { id: "ag2", userId: "u-acesso", kind: "agent", timeframe: "1h", status: "PAUSED" } });
    const re = await agents.PATCH(await reqFor("http://localhost/api/agents/ag2", patch({ status: "ACTIVE" })), { params: Promise.resolve({ id: "ag2" }) });
    expect(re.status).toBe(403);
    const pause = await agents.PATCH(await reqFor("http://localhost/api/agents/ag2", patch({ status: "PAUSED" })), { params: Promise.resolve({ id: "ag2" }) });
    expect(pause.status).toBe(200);
    fakeDb({ subscription: sub({ plan: "PRO" }), agent: { id: "se1", userId: "u-acesso", kind: "sentinel", timeframe: "15m", status: "PAUSED" } });
    const sentinels = await import("@/app/api/sentinels/[id]/route");
    const s = await sentinels.PATCH(await reqFor("http://localhost/api/sentinels/se1", patch({ status: "ACTIVE" })), { params: Promise.resolve({ id: "se1" }) });
    expect(s.status).toBe(403);
    expect((await json(s)).error?.message).toBe("Timeframe 15M disponível apenas no plano ELITE.");
    expect(writes.filter((w) => w.startsWith("agent:"))).toEqual(['agent:{"timeframe":"1d"}', 'agent:{"status":"PAUSED"}']);
  });

  it("ELITE muda agente para 1H", async () => {
    fakeDb({ subscription: sub({ plan: "ELITE" }), agent: { id: "ag1", userId: "u-acesso", kind: "agent", timeframe: "4h", status: "ACTIVE" } });
    const agents = await import("@/app/api/agents/[id]/route");
    const a = await agents.PATCH(await reqFor("http://localhost/api/agents/ag1", { method: "PATCH", body: JSON.stringify({ timeframe: "1h" }) }), { params: Promise.resolve({ id: "ag1" }) });
    expect(a.status).toBe(200);
  });

  it("GET /api/admin/overview usa requireAdmin (usuário comum → 403)", async () => {
    fakeDb({ subscription: sub({}) });
    const { GET } = await import("@/app/api/admin/overview/route");
    const res = await GET(await reqFor("http://localhost/api/admin/overview"), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect((await json(res)).error?.code).toBe("forbidden");
  });
});

describe("login: limite por fluxo e Redis indisponível", () => {
  afterEach(async () => {
    const { _setControlStoreForTests } = await import("@/lib/rate-limit");
    _setControlStoreForTests(undefined);
  });

  it("sem armazenamento compartilhado (produção sem Redis) responde 503 com texto fixo", async () => {
    const { _setControlStoreForTests } = await import("@/lib/rate-limit");
    _setControlStoreForTests(null);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@example.com", password: "x" }) }), { params: Promise.resolve({}) });
    expect(res.status).toBe(503);
    expect((await json(res)).error).toMatchObject({ code: "service_unavailable", message: "Serviço temporariamente indisponível. Tente em instantes." });
  });

  it("acima do limite por IP: 429 com Retry-After e X-RateLimit-Remaining", async () => {
    const { _setControlStoreForTests, createMemoryControlStore, flowConfig } = await import("@/lib/rate-limit");
    _setControlStoreForTests(createMemoryControlStore());
    const { POST } = await import("@/app/api/auth/login/route");
    const call = () => POST(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "x-real-ip": "192.0.2.44" }, body: JSON.stringify({ email: "a@example.com", password: "x" }) }), { params: Promise.resolve({}) });
    for (let i = 0; i < flowConfig("login_ip").limit; i++) expect((await call()).status).not.toBe(429);
    const res = await call();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    expect((await json(res)).error?.code).toBe("rate_limited");
  });
});
