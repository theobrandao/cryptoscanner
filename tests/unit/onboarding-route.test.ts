import { beforeEach, describe, expect, it, vi } from "vitest";

// Rota dos primeiros passos com banco simulado e sessão fixa.
const db = vi.hoisted(() => ({
  onboardedAt: null as Date | null,
  signals: 0,
  favorites: 0,
  agents: 0,
  monitors: 0,
  alerts: 0,
  learning: null as Record<string, { done: boolean }> | null,
  updateMany: vi.fn(),
  eventWhere: null as unknown,
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/database/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/database/client")>()),
  requirePrisma: () => ({
    user: { findUnique: async () => ({ onboardedAt: db.onboardedAt }), updateMany: db.updateMany },
    analyticsEvent: {
      count: async (a: { where: unknown }) => {
        db.eventWhere = a.where;
        return db.signals;
      },
    },
    watchlistItem: { count: async () => db.favorites },
    agent: { count: async () => db.agents },
    monitor: { count: async () => db.monitors },
    alert: { count: async () => db.alerts },
    userPreference: { findUnique: async () => ({ learning: db.learning }) },
  }),
}));

const { GET, POST } = await import("@/app/api/onboarding/route");
const req = (method = "GET") => new Request("http://localhost/api/onboarding", { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
type Body = { data: { dismissed: boolean; done: number; steps: Array<{ key: string; label: string; href: string; done: boolean }> } };

beforeEach(() => {
  Object.assign(db, { onboardedAt: null, signals: 0, favorites: 0, agents: 0, monitors: 0, alerts: 0, learning: null });
  db.updateMany.mockReset();
});

describe("primeiros passos (/api/onboarding)", () => {
  it("ordem por valor, rótulos em português, com Conta criada marcada", async () => {
    const r = (await (await GET(req(), { params: Promise.resolve({}) })).json()) as Body;
    expect(r.data.steps.map((s) => s.label)).toEqual(["Conta criada", "Ver os sinais do modelo", "Favoritar um ativo", "Criar um agente", "Ativar um alerta ou monitor", "Concluir 1 aula da Jornada"]);
    expect(r.data.steps.map((s) => s.done)).toEqual([true, false, false, false, false, false]);
    expect(r.data.steps[1]!.href).toBe("/#sinais");
    expect(r.data).toMatchObject({ dismissed: false, done: 1 });
    expect(JSON.stringify(r.data)).not.toMatch(/Dashboard|watchlist|AI Analyst/);
  });

  it("marca cada passo pelo que a conta fez e lê a dispensa de onboardedAt", async () => {
    Object.assign(db, { onboardedAt: new Date(), signals: 1, favorites: 2, agents: 1, monitors: 0, alerts: 1, learning: { "o-que-e-bitcoin": { done: true } } });
    const r = (await (await GET(req(), { params: Promise.resolve({}) })).json()) as Body;
    expect(r.data.steps.every((s) => s.done)).toBe(true);
    expect(r.data.dismissed).toBe(true);
    expect(db.eventWhere).toMatchObject({ userId: "u1", name: "onboarding_step", props: { path: ["step"], equals: "sinais" } });
  });

  it("POST grava a dispensa na conta só uma vez (não sobrescreve a data)", async () => {
    const res = await POST(req("POST"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(db.updateMany).toHaveBeenCalledWith({ where: { id: "u1", onboardedAt: null }, data: { onboardedAt: expect.any(Date) } });
  });
});
