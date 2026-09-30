import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { resetEnvCache } from "@/lib/env";
import { _setControlStoreForTests, createMemoryControlStore } from "@/lib/rate-limit";
import { consumeAiQuota, nextQuotaReset, quotaDay } from "@/services/ai-quota-service";

async function catchErr(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("esperava erro");
}

describe("cota da IA: dia em America/Sao_Paulo", () => {
  it("vira à meia-noite de Brasília (03:00 UTC), não à meia-noite UTC", () => {
    expect(quotaDay(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09-30");
    expect(quotaDay(new Date("2026-10-01T02:59:59Z"))).toBe("2026-09-30");
    expect(quotaDay(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01");
  });

  it("próxima renovação = próxima meia-noite em Brasília", () => {
    expect(new Date(nextQuotaReset(new Date("2026-09-30T12:00:00Z"))).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(new Date(nextQuotaReset(new Date("2026-10-01T02:59:00Z"))).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(new Date(nextQuotaReset(new Date("2026-10-01T03:00:00Z"))).toISOString()).toBe("2026-10-02T03:00:00.000Z");
  });
});

describe("cota da IA: débito, limite e estorno (Redis/memória)", () => {
  beforeEach(() => _setControlStoreForTests(createMemoryControlStore()));
  afterEach(() => _setControlStoreForTests(undefined));

  it("debita até o limite do plano e responde 429 ai_quota com Retry-After até a meia-noite", async () => {
    const now = new Date("2026-09-30T23:00:00Z"); // 20:00 em Brasília
    for (let i = 1; i <= 10; i++) expect((await consumeAiQuota("u1", "TRIAL", now)).used).toBe(i);
    const err = await catchErr(consumeAiQuota("u1", "TRIAL", now));
    expect(err.status).toBe(429);
    expect(err.code).toBe("ai_quota");
    expect(err.message).toContain("10 consultas de hoje");
    expect(err.headers?.["Retry-After"]).toBe(String(4 * 3600));
    // o débito acima do limite é desfeito: novas tentativas continuam bloqueadas sem acumular
    const t = await catchErr(consumeAiQuota("u1", "TRIAL", now));
    expect(t.code).toBe("ai_quota");
  });

  it("estorno devolve a consulta e é idempotente", async () => {
    const now = new Date("2026-09-30T15:00:00Z");
    const a = await consumeAiQuota("u2", "TRIAL", now);
    await a.refund();
    await a.refund();
    const b = await consumeAiQuota("u2", "TRIAL", now);
    expect(b.used).toBe(1);
    expect(b.remaining).toBe(9);
    expect(b.storage).toBe("memory");
  });

  it("limites por tier vêm do plano (sem mudança)", async () => {
    const now = new Date("2026-09-30T15:00:00Z");
    expect((await consumeAiQuota("u3", "PRO", now)).limit).toBe(100);
    expect((await consumeAiQuota("u3", "ELITE", now)).limit).toBe(500);
    expect((await consumeAiQuota("u3", "ADMIN", now)).limit).toBe(5000);
  });

  it("contagem recomeça no novo dia de Brasília", async () => {
    const late = new Date("2026-10-01T02:30:00Z"); // 23:30 do dia 30 em Brasília
    for (let i = 0; i < 10; i++) await consumeAiQuota("u4", "TRIAL", late);
    expect((await catchErr(consumeAiQuota("u4", "TRIAL", late))).code).toBe("ai_quota");
    const next = new Date("2026-10-01T03:01:00Z");
    const t = await consumeAiQuota("u4", "TRIAL", next);
    expect(t.used).toBe(1);
    expect(t.day).toBe("2026-10-01");
  });
});

describe("cota da IA sem Redis: Postgres (nunca memória da instância)", () => {
  const counts = new Map<string, number>();
  const upsert = vi.fn(async ({ where, create }: { where: { userId_day: { userId: string; day: string } }; create: { count: number } }) => {
    const k = `${where.userId_day.userId}:${where.userId_day.day}`;
    const n = (counts.get(k) ?? 0) + (counts.has(k) ? 1 : create.count);
    counts.set(k, n);
    return { count: n };
  });
  const updateMany = vi.fn(async ({ where }: { where: { userId: string; day: string } }) => {
    const k = `${where.userId}:${where.day}`;
    const n = counts.get(k) ?? 0;
    if (n > 0) counts.set(k, n - 1);
    return { count: n > 0 ? 1 : 0 };
  });

  beforeEach(() => {
    counts.clear();
    _setControlStoreForTests(null);
    process.env.DATABASE_URL = "postgresql://teste/nao-conecta";
    resetEnvCache();
    globalThis.__cryptoscannerPrisma = { aiUsage: { upsert, updateMany } } as unknown as PrismaClient;
  });
  afterEach(() => {
    _setControlStoreForTests(undefined);
    process.env.DATABASE_URL = "";
    resetEnvCache();
    globalThis.__cryptoscannerPrisma = undefined;
  });

  it("usa upsert com incremento e estorna com decremento", async () => {
    const now = new Date("2026-09-30T15:00:00Z");
    const a = await consumeAiQuota("u5", "TRIAL", now);
    expect(a.storage).toBe("postgres");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_day: { userId: "u5", day: "2026-09-30" } }, update: { count: { increment: 1 } } }));
    await a.refund();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u5", day: "2026-09-30", count: { gt: 0 } }, data: { count: { decrement: 1 } } }));
    expect(counts.get("u5:2026-09-30")).toBe(0);
  });

  it("limite também vale no Postgres", async () => {
    const now = new Date("2026-09-30T15:00:00Z");
    for (let i = 0; i < 10; i++) await consumeAiQuota("u6", "TRIAL", now);
    expect((await catchErr(consumeAiQuota("u6", "TRIAL", now))).code).toBe("ai_quota");
    expect(counts.get("u6:2026-09-30")).toBe(10);
  });

  it("sem Redis e sem banco: recusa com 503 em vez de contar na memória", async () => {
    process.env.DATABASE_URL = "";
    resetEnvCache();
    const err = await catchErr(consumeAiQuota("u7", "PRO"));
    expect(err.status).toBe(503);
    expect(err.message).toBe("Serviço temporariamente indisponível. Tente em instantes.");
  });
});
