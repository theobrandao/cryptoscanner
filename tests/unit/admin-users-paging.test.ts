import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ prisma: { user: { count: vi.fn(), findMany: vi.fn() }, accessLog: { groupBy: vi.fn() } } }));
vi.mock("@/database/client", () => ({ getPrisma: () => db.prisma, requirePrisma: () => db.prisma }));

import type { Prisma } from "@prisma/client";
import { tierFor, type Tier } from "@/lib/entitlements";
import { listUsers, tierWhere } from "@/services/admin-users-service";
import { mrrBrl } from "@/services/admin-service";

const now = new Date("2026-09-30T12:00:00Z");
const day = 86_400_000;

type Sub = { plan: string; status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null };
type U = { role: string; subscription: Sub | null };

/** Interpretador mínimo do subconjunto de filtros Prisma usado por tierWhere (a lógica de NULL do SQL foi conferida no Postgres local). */
function matchField(v: unknown, f: unknown): boolean {
  if (f === null) return v === null;
  if (typeof f !== "object" || f instanceof Date) return v === f;
  const o = f as { not?: unknown; gte?: Date };
  if ("not" in o && (o.not === null ? v === null : v === o.not)) return false;
  if (o.gte && (v === null || (v as Date).getTime() < o.gte.getTime())) return false;
  return true;
}
function matchSub(s: Sub, w: Prisma.SubscriptionWhereInput): boolean {
  return Object.entries(w).every(([k, f]) => (k === "OR" ? (f as Prisma.SubscriptionWhereInput[]).some((x) => matchSub(s, x)) : matchField(s[k as keyof Sub], f)));
}
function matchUser(u: U, w: Prisma.UserWhereInput): boolean {
  return Object.entries(w).every(([k, f]) => {
    if (k === "NOT") return (f as Prisma.UserWhereInput[]).every((x) => !matchUser(u, x));
    if (k === "subscription") return u.subscription !== null && matchSub(u.subscription, (f as { is: Prisma.SubscriptionWhereInput }).is);
    return matchField(u[k as keyof U], f);
  });
}

describe("tierWhere (banco) segue tierFor (regra do app)", () => {
  it("grade de planos × situações × datas", () => {
    const subs: Array<Sub | null> = [null];
    for (const plan of ["PRO", "ELITE"]) for (const status of ["TRIALING", "ACTIVE", "CANCELLED", "PAST_DUE", "EXPIRED"]) for (const off of [null, -5, -3, -2, -0.0001, 0, 1]) {
      const d = off === null ? null : new Date(now.getTime() + off * day);
      subs.push({ plan, status, trialEndsAt: d, currentPeriodEnd: d });
    }
    let checked = 0;
    for (const role of ["USER", "ADMIN"]) {
      for (const subscription of subs) {
        const expected = tierFor(subscription, role, now);
        for (const t of ["ADMIN", "TRIAL", "PRO", "ELITE", "NONE"] as Tier[]) {
          expect(matchUser({ role, subscription }, tierWhere(t, now)), `${role} ${JSON.stringify(subscription)} → ${t}`).toBe(expected === t);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe("lista do painel paginada no banco", () => {
  const user = (i: number) => ({ id: `u${i}`, name: `Pessoa ${i}`, email: `p${i}@example.com`, createdAt: new Date(now.getTime() - i * day), googleSub: null, role: "USER", blockedAt: null, blockedReason: null, telegramChatId: null, subscription: null, _count: { agents: 1, monitors: 0, alerts: 2, strategies: 0 } });

  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.user.count.mockResolvedValue(60);
    db.prisma.accessLog.groupBy.mockResolvedValue([{ userId: "u26", _max: { createdAt: now } }]);
  });

  it("filtro padrão: skip/take e ordem no banco, último acesso só da página, mesmo formato de resposta", async () => {
    db.prisma.user.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, i) => user(25 + i)));
    const r = await listUsers({ page: 2, pageSize: 25 });
    expect(db.prisma.user.findMany).toHaveBeenCalledTimes(1);
    const args = db.prisma.user.findMany.mock.calls[0]![0];
    expect(args).toMatchObject({ skip: 25, take: 25, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(db.prisma.accessLog.groupBy.mock.calls[0]![0].where.userId.in).toHaveLength(25);
    expect(Object.keys(r).sort()).toEqual(["page", "pageSize", "pages", "rows", "total", "totals"]);
    expect(r).toMatchObject({ total: 60, page: 2, pages: 3, pageSize: 25 });
    expect(Object.keys(r.totals).sort()).toEqual(["ADMIN", "ELITE", "NONE", "PRO", "TRIAL", "all", "blocked"]);
    expect(r.rows[1]).toMatchObject({ id: "u26", lastAccessAt: now, counts: { agents: 1, monitors: 0, alerts: 2, strategies: 0 }, tier: "NONE", status: "expirado" });
  });

  it("filtro por acesso também pagina no banco; total vem da contagem do tier", async () => {
    db.prisma.user.findMany.mockResolvedValue([]);
    const r = await listUsers({ tier: "ELITE", q: "ana" });
    const where = db.prisma.user.findMany.mock.calls[0]![0].where;
    expect(where.AND[1]).toMatchObject({ role: { not: "ADMIN" }, subscription: { is: { plan: "ELITE" } } });
    expect(where.AND[0].OR[0]).toEqual({ email: { contains: "ana", mode: "insensitive" } });
    expect(r.total).toBe(60);
  });

  it("filtro de situação usa o caminho em memória com teto e carrega detalhes só da página", async () => {
    db.prisma.user.findMany.mockImplementation(async (args: { take?: number; where?: { id?: { in: string[] } } }) => {
      if (args.where?.id) return args.where.id.in.map((id) => user(Number(id.slice(1))));
      return Array.from({ length: 30 }, (_, i) => ({ ...user(i), subscription: i % 2 ? { plan: "PRO", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null } : null }));
    });
    const r = await listUsers({ status: "ativo", pageSize: 10 });
    expect(db.prisma.user.findMany.mock.calls[0]![0].take).toBe(5000);
    expect(db.prisma.user.findMany.mock.calls[1]![0].where.id.in).toHaveLength(10);
    expect(r).toMatchObject({ total: 15, pages: 2, page: 1 });
  });
});

describe("MRR do painel", () => {
  it("soma os preços de venda das assinaturas pagas ativas de qualquer provedor; manual e teste ficam fora", () => {
    const prices = { PRICE_PRO_BRL: 97, PRICE_ELITE_BRL: 197 };
    const subs = [
      { eff: "ACTIVE", provider: "kiwify", plan: "PRO" },
      { eff: "ACTIVE", provider: "kiwify", plan: "ELITE" },
      { eff: "ACTIVE", provider: "mercadopago", plan: "PRO" },
      { eff: "ACTIVE", provider: "manual", plan: "ELITE" },
      { eff: "ACTIVE", provider: null, plan: "PRO" },
      { eff: "TRIALING", provider: null, plan: "PRO" },
      { eff: "PAST_DUE", provider: "kiwify", plan: "PRO" },
      { eff: "CANCELLED", provider: "kiwify", plan: "ELITE" },
    ];
    expect(mrrBrl(subs, prices)).toBe(97 + 197 + 97);
  });
});
