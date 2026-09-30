import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: async () => undefined };
});

import { actionBlockedReason, classifyUser, csvCell, extendedTrialEnd, grantPeriodEnd, initials, matchesFilter, toCsv, validityLabel } from "@/lib/admin-users";
import { adminUsersQuerySchema } from "@/lib/validation/admin";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const now = new Date("2026-09-30T12:00:00Z");
const day = 86_400_000;
const sub = (o: Partial<{ plan: string; status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null }>) => ({ plan: "PRO", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null, ...o });

describe("Painel de controle — acesso e situação", () => {
  it("classifica teste, pago, sem prazo, expirado, inadimplente, bloqueado e admin", () => {
    expect(classifyUser({ role: "USER", blockedAt: null, subscription: sub({ status: "TRIALING", trialEndsAt: new Date(now.getTime() + day) }) }, now)).toMatchObject({ tier: "TRIAL", status: "teste" });
    expect(classifyUser({ role: "USER", blockedAt: null, subscription: sub({ status: "TRIALING", trialEndsAt: new Date(now.getTime() - day) }) }, now)).toMatchObject({ tier: "NONE", status: "expirado", effective: "EXPIRED" });
    expect(classifyUser({ role: "USER", blockedAt: null, subscription: sub({ plan: "ELITE", currentPeriodEnd: new Date(now.getTime() + 5 * day) }) }, now)).toMatchObject({ tier: "ELITE", status: "ativo" });
    expect(classifyUser({ role: "USER", blockedAt: null, subscription: sub({ currentPeriodEnd: null }) }, now)).toMatchObject({ tier: "PRO", status: "ativo" });
    // pagamento vencido há 5 dias (tolerância de 3): inadimplente e sem acesso
    expect(classifyUser({ role: "USER", blockedAt: null, subscription: sub({ currentPeriodEnd: new Date(now.getTime() - 5 * day) }) }, now)).toMatchObject({ tier: "NONE", status: "inadimplente" });
    expect(classifyUser({ role: "USER", blockedAt: now, subscription: sub({}) }, now)).toMatchObject({ tier: "PRO", status: "bloqueado" });
    expect(classifyUser({ role: "ADMIN", blockedAt: null, subscription: null }, now)).toMatchObject({ tier: "ADMIN", status: "ativo" });
    expect(classifyUser({ role: "USER", blockedAt: null, subscription: null }, now)).toMatchObject({ tier: "NONE", status: "expirado" });
  });

  it("filtro por acesso e por situação (ausente = todos)", () => {
    const row = { tier: "TRIAL" as const, status: "bloqueado" as const };
    expect(matchesFilter(row, {})).toBe(true);
    expect(matchesFilter(row, { tier: "TRIAL" })).toBe(true);
    expect(matchesFilter(row, { tier: "PRO" })).toBe(false);
    expect(matchesFilter(row, { status: "bloqueado" })).toBe(true);
    expect(matchesFilter(row, { tier: "TRIAL", status: "teste" })).toBe(false);
  });

  it("valida os filtros da URL", () => {
    expect(adminUsersQuerySchema.parse({ tier: "ELITE", status: "inadimplente", sort: "nome", page: "2" })).toEqual({ tier: "ELITE", status: "inadimplente", sort: "nome", page: 2 });
    expect(() => adminUsersQuerySchema.parse({ tier: "PLATINUM" })).toThrow();
    expect(() => adminUsersQuerySchema.parse({ page: "0" })).toThrow();
  });

  it("validade em texto curto", () => {
    expect(validityLabel("TRIAL", { status: "TRIALING", trialEndsAt: "2026-10-03T15:00:00Z", currentPeriodEnd: null })).toBe("teste até 03/10");
    expect(validityLabel("PRO", { status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: "2026-10-30T15:00:00Z" })).toBe("até 30/10/2026");
    expect(validityLabel("ELITE", { status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null })).toBe("sem prazo");
    expect(validityLabel("ADMIN", null)).toBe("sem prazo");
    expect(validityLabel("NONE", { status: "EXPIRED", trialEndsAt: null, currentPeriodEnd: "2026-09-01T15:00:00Z" })).toBe("encerrado em 01/09/2026");
    expect(validityLabel("NONE", null)).toBe("—");
  });
});

describe("Painel de controle — travas das ações", () => {
  const user = { id: "u1", role: "USER", isOwner: false };
  it("permite ações sobre contas comuns", () => {
    for (const a of ["grant", "extend_trial", "revoke", "block", "unblock", "end_sessions", "password_reset", "delete"] as const) expect(actionBlockedReason(a, user, "adm")).toBeNull();
  });
  it("recusa contas de administrador e do dono (OWNER_EMAILS), mesmo com papel USER", () => {
    expect(actionBlockedReason("grant", { id: "a2", role: "ADMIN", isOwner: false }, "adm")).toMatch(/administrador/);
    expect(actionBlockedReason("delete", { id: "o1", role: "USER", isOwner: true }, "adm")).toMatch(/administrador/);
  });
  it("recusa bloquear, excluir ou encerrar o acesso da própria conta", () => {
    for (const a of ["block", "delete", "revoke"] as const) expect(actionBlockedReason(a, { id: "adm", role: "ADMIN", isOwner: true }, "adm")).toMatch(/própria conta/);
  });
});

describe("Painel de controle — prazos", () => {
  it("liberar acesso soma ao período ativo que resta; sem prazo = null", () => {
    expect(grantPeriodEnd(null, null, now)).toBeNull();
    expect(grantPeriodEnd(7, null, now)?.getTime()).toBe(now.getTime() + 7 * day);
    const end = new Date(now.getTime() + 10 * day);
    expect(grantPeriodEnd(30, { status: "ACTIVE", currentPeriodEnd: end }, now)?.getTime()).toBe(end.getTime() + 30 * day);
    // período vencido ou assinatura não ativa: conta a partir de agora
    expect(grantPeriodEnd(30, { status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() - day) }, now)?.getTime()).toBe(now.getTime() + 30 * day);
    expect(grantPeriodEnd(30, { status: "TRIALING", currentPeriodEnd: end }, now)?.getTime()).toBe(now.getTime() + 30 * day);
  });
  it("estender teste soma ao fim do teste (ou a partir de agora, se já terminou)", () => {
    expect(extendedTrialEnd(3, new Date(now.getTime() + 2 * day), now).getTime()).toBe(now.getTime() + 5 * day);
    expect(extendedTrialEnd(7, new Date(now.getTime() - 2 * day), now).getTime()).toBe(now.getTime() + 7 * day);
    expect(extendedTrialEnd(7, null, now).getTime()).toBe(now.getTime() + 7 * day);
  });
});

describe("Painel de controle — CSV para Excel", () => {
  it("escapa separador, aspas e quebra de linha", () => {
    expect(csvCell("simples")).toBe("simples");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("linha\nnova")).toBe('"linha\nnova"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
  });
  it("neutraliza fórmulas (=, +, -, @)", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+55 11")).toBe("'+55 11");
    expect(csvCell("@nome")).toBe("'@nome");
  });
  it("gera BOM UTF-8, ';' e CRLF", () => {
    const csv = toCsv(["Nome", "E-mail"], [["José", "jose@x.com"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Nome;E-mail\r\nJosé;jose@x.com\r\n");
  });
  it("iniciais do avatar", () => {
    expect(initials("Maria da Silva", "m@x.com")).toBe("MS");
    expect(initials("", "joao@x.com")).toBe("JO");
  });
});

describe("rotas /api/admin/users", () => {
  const headers = async (role: "USER" | "ADMIN") => ({ cookie: `${SESSION_COOKIE}=${await createSessionToken({ id: "u9", email: "u9@b.c", name: "U", plan: "PRO", role })}` });
  const ctx = (id?: string) => ({ params: Promise.resolve<Record<string, string>>(id ? { id } : {}) });

  it("sem sessão → 401; usuário comum → 403 em lista, detalhe, ações, exclusão, exportação e registro", async () => {
    const list = await import("@/app/api/admin/users/route");
    const detail = await import("@/app/api/admin/users/[id]/route");
    const actions = await import("@/app/api/admin/users/[id]/actions/route");
    const exp = await import("@/app/api/admin/users/export/route");
    const audit = await import("@/app/api/admin/audit/route");
    expect((await list.GET(new Request("http://localhost/api/admin/users"), ctx())).status).toBe(401);
    const h = await headers("USER");
    expect((await list.GET(new Request("http://localhost/api/admin/users", { headers: h }), ctx())).status).toBe(403);
    expect((await detail.GET(new Request("http://localhost/api/admin/users/x", { headers: h }), ctx("x"))).status).toBe(403);
    expect((await detail.DELETE(new Request("http://localhost/api/admin/users/x", { method: "DELETE", headers: h, body: JSON.stringify({ confirmEmail: "a@b.c" }) }), ctx("x"))).status).toBe(403);
    expect((await actions.POST(new Request("http://localhost/api/admin/users/x/actions", { method: "POST", headers: h, body: JSON.stringify({ action: "revoke" }) }), ctx("x"))).status).toBe(403);
    expect((await exp.GET(new Request("http://localhost/api/admin/users/export", { headers: h }), ctx())).status).toBe(403);
    expect((await audit.GET(new Request("http://localhost/api/admin/audit", { headers: h }), ctx())).status).toBe(403);
  });

  it("admin com ação inválida → 400 (validação antes do banco)", async () => {
    const actions = await import("@/app/api/admin/users/[id]/actions/route");
    const h = await headers("ADMIN");
    const bad = await actions.POST(new Request("http://localhost/api/admin/users/x/actions", { method: "POST", headers: h, body: JSON.stringify({ action: "extend_trial", days: 99 }) }), ctx("x"));
    expect(bad.status).toBe(400);
    const unknown = await actions.POST(new Request("http://localhost/api/admin/users/x/actions", { method: "POST", headers: h, body: JSON.stringify({ action: "promote" }) }), ctx("x"));
    expect(unknown.status).toBe(400);
  });
});
