import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DatabaseUnavailableError } from "@/database/client";
import { ApiError, handleError, isUnavailableError, validationDetails } from "@/lib/api";
import { ProviderError } from "@/services/market/providers/types";

const UNAVAILABLE = "Serviço temporariamente indisponível. Tente em instantes.";
type Body = { ok: boolean; error: { code: string; message: string; details?: Array<{ path: string; field: string; message: string }> } };

describe("handleError: sem texto técnico para o usuário", () => {
  it("banco indisponível → 503 com texto fixo (sem nome de variável de ambiente)", async () => {
    const res = handleError(new DatabaseUnavailableError());
    expect(res.status).toBe(503);
    const b = (await res.json()) as Body;
    expect(b).toMatchObject({ ok: false, error: { code: "database_unavailable", message: UNAVAILABLE } });
    expect(JSON.stringify(b)).not.toContain("DATABASE_URL");
  });

  it("erro de conexão do Prisma → 503 database_unavailable", async () => {
    const e = Object.assign(new Error("Can't reach database server at `ep-x.neon.tech`"), { name: "PrismaClientInitializationError" });
    const res = handleError(e);
    expect(res.status).toBe(503);
    const b = (await res.json()) as Body;
    expect(b.error).toMatchObject({ code: "database_unavailable", message: UNAVAILABLE });
    expect(b.error.message).not.toContain("neon");
  });

  it("falha de provedor de mercado → 503 provider_unavailable", async () => {
    for (const e of [new ProviderError("binance", "HTTP 451"), new Error("Todos os provedores falharam para candles: [binance] HTTP 451 | [kraken] timeout")]) {
      expect(isUnavailableError(e)).toBe(true);
      const res = handleError(e);
      expect(res.status).toBe(503);
      const b = (await res.json()) as Body;
      expect(b.error).toEqual({ code: "provider_unavailable", message: UNAVAILABLE });
    }
  });

  it("ApiError mantém status, código e cabeçalhos; toda resposta de erro é no-store", async () => {
    const res = handleError(new ApiError(429, "Muitas tentativas.", "rate_limited", { retryAfter: 5 }, { "Retry-After": "5" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(((await res.json()) as Body).error.code).toBe("rate_limited");
  });

  it("erro desconhecido não é mascarado como 503", () => {
    expect(isUnavailableError(new Error("x"))).toBe(false);
    expect(handleError(new Error("x")).status).toBe(500);
  });
});

describe("validação: mesmo formato, mensagens e campos em português", () => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2).max(5), symbols: z.array(z.string()).min(1), kind: z.enum(["a", "b"]), timeframe: z.string() });

  it("traduz as mensagens padrão do zod e dá o rótulo do campo", async () => {
    const r = schema.safeParse({ email: "x", password: "123", name: "abcdefg", symbols: [], kind: "c" });
    expect(r.success).toBe(false);
    const details = validationDetails(r.error!);
    const by = Object.fromEntries(details.map((d) => [d.path, d]));
    expect(by.email).toEqual({ path: "email", field: "E-mail", message: "Informe um e-mail válido." });
    expect(by.password).toEqual({ path: "password", field: "Senha", message: "Use pelo menos 8 caracteres." });
    expect(by.name?.message).toBe("Use no máximo 5 caracteres.");
    expect(by.symbols).toEqual({ path: "symbols", field: "Ativos", message: "Escolha pelo menos 1 item." });
    expect(by.kind?.message).toBe("Opção inválida.");
    expect(by.timeframe).toEqual({ path: "timeframe", field: "Tempo gráfico", message: "Campo obrigatório." });
    for (const d of details) expect(d.message).not.toMatch(/^(Invalid|Too|Expected)/);

    const res = handleError(r.error);
    expect(res.status).toBe(400);
    const b = (await res.json()) as Body;
    expect(b.ok).toBe(false);
    expect(b.error.code).toBe("validation");
    expect(b.error.message).toBe("Confira os dados informados.");
    expect(b.error.details).toHaveLength(details.length);
  });

  it("mensagem própria do schema é mantida; um único erro vira mensagem com o rótulo", async () => {
    const s = z.object({ acceptTerms: z.literal(true, { message: "É preciso aceitar os Termos de Uso" }) });
    const r = s.safeParse({ acceptTerms: false });
    const b = (await handleError(r.error).json()) as Body;
    expect(b.error.details?.[0]).toEqual({ path: "acceptTerms", field: "Aceite dos termos", message: "É preciso aceitar os Termos de Uso" });
    expect(b.error.message).toBe("Aceite dos termos: É preciso aceitar os Termos de Uso");
  });
});
