import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { OWNER_PASSWORD_PROMOTION_CUTOFF } from "@/lib/owner-promotion";
import { exchangeCode, googleLinkChanges, redirectUri, safeNext, startGoogleLogin } from "@/services/google-auth-service";

const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, app: process.env.NEXT_PUBLIC_APP_URL };
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "client-id-teste.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "segredo-teste";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.cryptoscanner.com.br/";
  resetEnvCache();
});
afterEach(() => {
  process.env.GOOGLE_CLIENT_ID = saved.id;
  process.env.GOOGLE_CLIENT_SECRET = saved.secret;
  process.env.NEXT_PUBLIC_APP_URL = saved.app;
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("Login com Google — início", () => {
  it("monta a URL do Google com PKCE, state e redirect_uri do domínio", () => {
    const s = startGoogleLogin({ next: "/planos", acceptTerms: true });
    const u = new URL(s.url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("client-id-teste.apps.googleusercontent.com");
    expect(u.searchParams.get("redirect_uri")).toBe("https://www.cryptoscanner.com.br/api/auth/google/callback");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const c = JSON.parse(s.cookie);
    expect(c.state).toBe(u.searchParams.get("state"));
    expect(c.verifier.length).toBeGreaterThan(40);
    expect(c.next).toBe("/planos");
    expect(c.accept).toBe(true);
    expect(redirectUri()).toBe("https://www.cryptoscanner.com.br/api/auth/google/callback");
  });
  it("destino só interno (sem open redirect)", () => {
    expect(safeNext("/carteira")).toBe("/carteira");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
  it("sem credenciais → 503", () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    resetEnvCache();
    expect(() => startGoogleLogin({ next: "/", acceptTerms: false })).toThrow(/não configurado/);
  });
});

describe("Login com Google — troca do código e validação do id_token", () => {
  const mockFetch = (token: object, info: object, infoStatus = 200) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify(token), { status: 200 });
      if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) return new Response(JSON.stringify(info), { status: infoStatus });
      throw new Error(`fetch inesperado ${url}`);
    });
  it("aceita token válido do cliente certo com e-mail verificado", async () => {
    mockFetch({ id_token: "x" }, { aud: "client-id-teste.apps.googleusercontent.com", iss: "https://accounts.google.com", sub: "123", email: "Pessoa@Gmail.com", email_verified: "true", name: "Pessoa" });
    const id = await exchangeCode("code", "verifier");
    expect(id).toEqual({ sub: "123", email: "pessoa@gmail.com", name: "Pessoa", emailVerified: true });
  });
  it("recusa aud de outro cliente, e-mail não verificado e emissor errado", async () => {
    mockFetch({ id_token: "x" }, { aud: "outro", iss: "https://accounts.google.com", sub: "1", email: "a@b.com", email_verified: "true" });
    await expect(exchangeCode("c", "v")).rejects.toThrow(/inválido/);
    vi.restoreAllMocks();
    mockFetch({ id_token: "x" }, { aud: "client-id-teste.apps.googleusercontent.com", iss: "https://accounts.google.com", sub: "1", email: "a@b.com", email_verified: "false" });
    await expect(exchangeCode("c", "v")).rejects.toThrow(/inválido/);
    vi.restoreAllMocks();
    mockFetch({ id_token: "x" }, { aud: "client-id-teste.apps.googleusercontent.com", iss: "https://evil.example", sub: "1", email: "a@b.com", email_verified: "true" });
    await expect(exchangeCode("c", "v")).rejects.toThrow(/inválido/);
  });
  it("falha na troca do código → 401 sem expor detalhes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(exchangeCode("c", "v")).rejects.toThrow(/Não foi possível concluir/);
  });
});

describe("Login com Google — vínculo com conta existente", () => {
  const savedOwners = process.env.OWNER_EMAILS;
  beforeEach(() => {
    process.env.OWNER_EMAILS = "dono@example.com";
    resetEnvCache();
  });
  afterEach(() => {
    if (savedOwners === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = savedOwners;
    resetEnvCache();
  });
  const later = new Date(OWNER_PASSWORD_PROMOTION_CUTOFF.getTime() + 86_400_000);
  const identity = { sub: "g-1", email: "pessoa@example.com", name: "Pessoa", emailVerified: true };

  it("conta criada por senha (sem googleSub) é vinculada e a senha antiga é invalidada", () => {
    const c = googleLinkChanges({ googleSub: null, email: "pessoa@example.com", plan: "PRO", role: "USER", createdAt: later }, identity);
    expect(c).toEqual({ googleSub: "g-1", resetPassword: true });
  });
  it("conta já vinculada ao mesmo Google não muda nada", () => {
    const c = googleLinkChanges({ googleSub: "g-1", email: "pessoa@example.com", plan: "PRO", role: "USER", createdAt: later }, identity);
    expect(c).toEqual({ resetPassword: false });
  });
  it("conta já vinculada a outro Google troca o vínculo sem mexer na senha", () => {
    const c = googleLinkChanges({ googleSub: "g-antigo", email: "pessoa@example.com", plan: "PRO", role: "USER", createdAt: later }, identity);
    expect(c).toEqual({ googleSub: "g-1", resetPassword: false });
  });
  it("dono com e-mail verificado vira ADMIN + PLATINUM mesmo com conta criada depois do corte", () => {
    const c = googleLinkChanges({ googleSub: null, email: "dono@example.com", plan: "PRO", role: "USER", createdAt: later }, { ...identity, email: "dono@example.com" });
    expect(c).toEqual({ googleSub: "g-1", resetPassword: true, plan: "PLATINUM", role: "ADMIN" });
  });
  it("dono sem e-mail verificado não é promovido", () => {
    const c = googleLinkChanges({ googleSub: "g-1", email: "dono@example.com", plan: "PRO", role: "USER", createdAt: later }, { ...identity, email: "dono@example.com", emailVerified: false });
    expect(c).toEqual({ resetPassword: false });
  });
});
