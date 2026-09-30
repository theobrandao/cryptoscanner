import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco simulado: só o necessário para as consultas do worker e as transações do painel.
const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = { user: { update: fn() }, agent: { updateMany: fn() }, alert: { updateMany: fn() }, monitor: { updateMany: fn() }, subscription: { update: fn(), create: fn(), upsert: fn() }, adminAuditLog: { create: fn() } };
  const prisma = {
    agent: { findMany: fn(), update: fn() },
    agentLog: { create: fn() },
    alert: { findMany: fn(), update: fn() },
    monitor: { findMany: fn(), update: fn() },
    scanHistoryEntry: { create: fn() },
    user: { findUnique: fn() },
    $transaction: fn(),
  };
  return { prisma, tx };
});
vi.mock("@/database/client", () => ({ getPrisma: () => db.prisma, requirePrisma: () => db.prisma }));
vi.mock("@/services/market/market-service", () => ({ getTickers: vi.fn(async () => ({ tickers: [{ symbol: "BTC", price: 100 }] })), getCandles: vi.fn(async () => ({ candles: [] })) }));
vi.mock("@/services/push-service", () => ({ sendPushToUser: vi.fn(async () => ({ sent: 0, removed: 0 })) }));

import { automationsAllowed } from "@/lib/admin-users";
import { evaluateAlerts } from "@/services/alert-service";
import { evaluateMonitors } from "@/services/monitor-service";
import { runAllActiveAgents } from "@/services/user-agent-service";
import { blockUser, grantAccess, revokeAccess, unblockUser } from "@/services/admin-users-service";

const now = new Date("2026-09-30T12:00:00Z");
const day = 86_400_000;
const activeSub = { plan: "PRO", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 30 * day) };
const expiredSub = { plan: "PRO", status: "EXPIRED", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 30 * day) };

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (t: typeof db.tx) => unknown)(db.tx) : Promise.all(arg as unknown[])));
  db.tx.agent.updateMany.mockResolvedValue({ count: 2 });
  db.tx.alert.updateMany.mockResolvedValue({ count: 3 });
  db.tx.monitor.updateMany.mockResolvedValue({ count: 1 });
});

describe("Automações só rodam para conta ativa e com acesso", () => {
  it("regra pura: bloqueada ou sem acesso não recebe alertas automáticos", () => {
    expect(automationsAllowed({ blockedAt: null, role: "USER", subscription: { ...activeSub, currentPeriodEnd: new Date(now.getTime() + day) } }, now)).toBe(true);
    expect(automationsAllowed({ blockedAt: now, role: "USER", subscription: { ...activeSub, currentPeriodEnd: new Date(now.getTime() + day) } }, now)).toBe(false);
    expect(automationsAllowed({ blockedAt: null, role: "USER", subscription: null }, now)).toBe(false);
    expect(automationsAllowed({ blockedAt: null, role: "USER", subscription: { ...expiredSub, currentPeriodEnd: new Date(now.getTime() - day) } }, now)).toBe(false);
    expect(automationsAllowed({ blockedAt: null, role: "ADMIN", subscription: null }, now)).toBe(true);
    expect(automationsAllowed({ blockedAt: now, role: "ADMIN", subscription: null }, now)).toBe(false);
  });

  it("agentes: consulta ignora contas bloqueadas e pula dono sem acesso", async () => {
    const agent = (id: string, subscription: unknown) => ({ id, userId: `u-${id}`, symbols: [], strategies: [], timeframe: "4h", minConfidence: 70, lastAlertAt: null, user: { blockedAt: null, role: "USER", subscription } });
    db.prisma.agent.findMany.mockResolvedValue([agent("ok", activeSub), agent("sem-acesso", expiredSub)]);
    const out = await runAllActiveAgents();
    const where = db.prisma.agent.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "ACTIVE", user: { blockedAt: null } });
    expect(out.map((s) => s.agentId)).toEqual(["ok"]);
    expect(db.prisma.agent.update).toHaveBeenCalledTimes(1);
    expect(db.prisma.agent.update.mock.calls[0]![0].where).toEqual({ id: "ok" });
  });

  it("agentes: timeframe fora do plano atual (1H no PRO) é pulado, não apagado; ELITE roda 1H", async () => {
    const agent = (id: string, timeframe: string, subscription: unknown) => ({ id, userId: `u-${id}`, symbols: [], strategies: [], timeframe, minConfidence: 70, lastAlertAt: null, user: { blockedAt: null, role: "USER", subscription } });
    db.prisma.agent.findMany.mockResolvedValue([agent("pro-4h", "4h", activeSub), agent("pro-1h", "1h", activeSub), agent("elite-1h", "1h", { ...activeSub, plan: "ELITE" })]);
    const out = await runAllActiveAgents();
    expect(db.prisma.agent.findMany.mock.calls[0]![0].select).toMatchObject({ timeframe: true });
    expect(out.map((s) => s.agentId)).toEqual(["pro-4h", "elite-1h"]);
    expect(db.prisma.agent.update.mock.calls.map((c) => c[0].where.id)).toEqual(["pro-4h", "elite-1h"]);
    expect(db.prisma.agent.update.mock.calls.every((c) => c[0].data.status === undefined)).toBe(true);
  });

  it("alertas: consulta ignora contas bloqueadas e não dispara para dono sem acesso", async () => {
    const alert = (id: string, subscription: unknown) => ({ id, userId: `u-${id}`, kind: "price_above", threshold: 50, timeframe: "1h", channel: "push", asset: { symbol: "BTC" }, user: { id: `u-${id}`, telegramChatId: null, blockedAt: null, role: "USER", subscription } });
    db.prisma.alert.findMany.mockResolvedValue([alert("ok", activeSub), alert("sem-acesso", expiredSub)]);
    const r = await evaluateAlerts();
    expect(db.prisma.alert.findMany.mock.calls[0]![0].where).toMatchObject({ active: true, user: { blockedAt: null } });
    expect(r).toEqual({ evaluated: 1, triggered: 1 });
    expect(db.prisma.alert.update).toHaveBeenCalledTimes(1);
    expect(db.prisma.alert.update.mock.calls[0]![0].where).toEqual({ id: "ok" });
  });

  it("monitores: consulta ignora contas bloqueadas", async () => {
    db.prisma.monitor.findMany.mockResolvedValue([]);
    await evaluateMonitors({ budgetMs: 1000 });
    expect(db.prisma.monitor.findMany.mock.calls[0]![0].where).toMatchObject({ active: true, user: { blockedAt: null } });
  });
});

describe("Painel: bloquear/encerrar acesso pausa as automações", () => {
  const actor = { id: "admin-1", email: "admin@example.com" };
  const target = { id: "u-1", email: "pessoa@example.com", name: "Pessoa", role: "USER", blockedAt: null, subscription: activeSub };

  it("bloquear pausa agentes ativos, desativa alertas e monitores e registra as contagens", async () => {
    db.prisma.user.findUnique.mockResolvedValue(target);
    await blockUser(actor, "u-1", "abuso");
    expect(db.tx.agent.updateMany).toHaveBeenCalledWith({ where: { userId: "u-1", status: "ACTIVE" }, data: { status: "PAUSED" } });
    expect(db.tx.alert.updateMany).toHaveBeenCalledWith({ where: { userId: "u-1", active: true }, data: { active: false } });
    expect(db.tx.monitor.updateMany.mock.calls[0]![0]).toMatchObject({ where: { userId: "u-1", active: true }, data: { active: false } });
    expect(db.tx.adminAuditLog.create.mock.calls[0]![0].data.details).toMatchObject({ reason: "abuso", paused: { agents: 2, alerts: 3, monitors: 1 } });
  });

  it("encerrar acesso também pausa as automações", async () => {
    db.prisma.user.findUnique.mockResolvedValue(target);
    await revokeAccess(actor, "u-1");
    expect(db.tx.agent.updateMany).toHaveBeenCalledWith({ where: { userId: "u-1", status: "ACTIVE" }, data: { status: "PAUSED" } });
    expect(db.tx.alert.updateMany).toHaveBeenCalledWith({ where: { userId: "u-1", active: true }, data: { active: false } });
    expect(db.tx.monitor.updateMany).toHaveBeenCalledTimes(1);
    expect(db.tx.adminAuditLog.create.mock.calls[0]![0].data.details).toMatchObject({ paused: { agents: 2, alerts: 3, monitors: 1 } });
  });

  it("desbloquear e liberar acesso não retomam automações (o usuário reativa) e isso fica no registro", async () => {
    db.prisma.user.findUnique.mockResolvedValue({ ...target, blockedAt: now });
    await unblockUser(actor, "u-1");
    db.prisma.user.findUnique.mockResolvedValue(target);
    await grantAccess(actor, "u-1", "PRO", 30);
    expect(db.tx.agent.updateMany).not.toHaveBeenCalled();
    expect(db.tx.alert.updateMany).not.toHaveBeenCalled();
    expect(db.tx.monitor.updateMany).not.toHaveBeenCalled();
    for (const call of db.tx.adminAuditLog.create.mock.calls) expect(call[0].data.details).toMatchObject({ automations: "manual_resume" });
  });
});
