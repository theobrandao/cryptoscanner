import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, enforceRateLimit, handleError } from "@/lib/api";
import { _setControlStoreForTests, createMemoryControlStore, emailKey, flowConfig, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const req = (ip = "203.0.113.7") => new Request("http://localhost/api/x", { headers: { "x-real-ip": ip } });

async function catchErr(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("esperava erro");
}

describe("rate-limit: janela, TTL real e cabeçalhos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    _setControlStoreForTests(createMemoryControlStore());
  });
  afterEach(() => {
    vi.useRealTimers();
    _setControlStoreForTests(undefined);
  });

  it("conta dentro da janela e devolve o tempo restante real", async () => {
    const a = await rateLimit("t", "k", 3, { windowSeconds: 60 });
    expect(a).toMatchObject({ allowed: true, remaining: 2, limit: 3, retryAfterSeconds: 60, available: true });
    vi.advanceTimersByTime(20_000);
    await rateLimit("t", "k", 3, { windowSeconds: 60 });
    const c = await rateLimit("t", "k", 3, { windowSeconds: 60 });
    expect(c.remaining).toBe(0);
    expect(c.allowed).toBe(true);
    const d = await rateLimit("t", "k", 3, { windowSeconds: 60 });
    expect(d.allowed).toBe(false);
    // janela começou no 1º acesso: faltam 40 s, não 60
    expect(d.retryAfterSeconds).toBe(40);
    expect(d.resetAt).toBe(Date.now() + 40_000);
    vi.advanceTimersByTime(40_001);
    expect((await rateLimit("t", "k", 3, { windowSeconds: 60 })).allowed).toBe(true);
  });

  it("baldes por fluxo são independentes", async () => {
    const limit = flowConfig("login_ip").limit;
    for (let i = 0; i < limit; i++) await enforceRateLimit(req(), "login_ip");
    const err = await catchErr(enforceRateLimit(req(), "login_ip"));
    expect(err.status).toBe(429);
    // cadastro e esqueci a senha do mesmo IP continuam livres
    await expect(enforceRateLimit(req(), "register")).resolves.toMatchObject({ allowed: true });
    await expect(enforceRateLimit(req(), "password_forgot")).resolves.toMatchObject({ allowed: true });
    // outro IP também
    await expect(enforceRateLimit(req("198.51.100.1"), "login_ip")).resolves.toMatchObject({ allowed: true });
  });

  it("429 sai com Retry-After, X-RateLimit-Remaining e mensagem em português", async () => {
    const { limit } = flowConfig("login_email");
    const key = emailKey("Pessoa@Example.com ");
    for (let i = 0; i < limit; i++) await enforceRateLimit(req(), "login_email", key);
    vi.advanceTimersByTime(60_000);
    const err = await catchErr(enforceRateLimit(req("198.51.100.9"), "login_email", key));
    const res = handleError(err);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(15 * 60 - 60));
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(res.headers.get("x-ratelimit-limit")).toBe(String(limit));
    const body = (await res.json()) as { error: { code: string; message: string; details: { retryAfter: number } } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toBe("Muitas tentativas. Aguarde 840 s e tente de novo.");
    expect(body.error.details.retryAfter).toBe(840);
  });

  it("e-mail normalizado: maiúsculas e espaços caem no mesmo balde; o hash não guarda o e-mail", () => {
    expect(emailKey(" A@B.com")).toBe(emailKey("a@b.com"));
    expect(emailKey("a@b.com")).not.toContain("@");
    expect(emailKey("a@b.com")).toHaveLength(32);
  });

  it("cabeçalhos: Retry-After só quando bloqueado", () => {
    const r = { limit: 10, remaining: 3, resetAt: 1_000_000, retryAfterSeconds: 12 };
    expect(rateLimitHeaders(r, false)["Retry-After"]).toBeUndefined();
    expect(rateLimitHeaders(r, true)).toMatchObject({ "Retry-After": "12", "X-RateLimit-Remaining": "3", "X-RateLimit-Limit": "10", "X-RateLimit-Reset": "1000" });
  });
});

describe("rate-limit sem armazenamento compartilhado (produção sem Redis)", () => {
  beforeEach(() => _setControlStoreForTests(null));
  afterEach(() => _setControlStoreForTests(undefined));

  it("login e cadastro respondem 503 com texto fixo, sem contar na memória da instância", async () => {
    for (const flow of ["login_ip", "login_email", "register"] as const) {
      const err = await catchErr(enforceRateLimit(req(), flow, flow === "login_email" ? emailKey("a@b.com") : undefined));
      expect(err.status).toBe(503);
      expect(err.code).toBe("service_unavailable");
      expect(err.message).toBe("Serviço temporariamente indisponível. Tente em instantes.");
    }
  });

  it("demais fluxos seguem limitados (contagem local, registrada no log)", async () => {
    await expect(enforceRateLimit(req(), "public")).resolves.toMatchObject({ allowed: true, available: true });
    const r = await rateLimit("x", "y", 1);
    expect(r.available).toBe(true);
  });
});
