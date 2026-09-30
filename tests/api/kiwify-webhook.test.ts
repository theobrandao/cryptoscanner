import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Webhook da Kiwify com banco em memória (sem Postgres): assinatura, reentrega, produto desconhecido, e-mail sem conta,
// sequência aprovado → atrasado → cancelado → reembolsado e evento antigo reenviado fora de ordem.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: async () => undefined };
});

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ billingEvents: new Map<string, Row>(), grants: new Map<string, Row>(), users: new Map<string, Row>(), subs: new Map<string, Row>(), seq: 0 }));

vi.mock("@/database/client", async () => {
  const { Prisma: P } = await import("@prisma/client");
  const grantKey = (w: { provider_externalId: { provider: string; externalId: string } }) => `${w.provider_externalId.provider}:${w.provider_externalId.externalId}`;
  const fake = {
    billingEvent: {
      create: async ({ data }: { data: Row }) => {
        const key = String(data.eventKey);
        if (db.billingEvents.has(key)) throw new P.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
        const row = { processed: false, error: null, ...data };
        db.billingEvents.set(key, row);
        return row;
      },
      findUnique: async ({ where }: { where: { eventKey: string } }) => db.billingEvents.get(where.eventKey) ?? null,
      update: async ({ where, data }: { where: { eventKey: string }; data: Row }) => {
        const row = { ...db.billingEvents.get(where.eventKey), ...data };
        db.billingEvents.set(where.eventKey, row);
        return row;
      },
    },
    externalGrant: {
      findUnique: async ({ where }: { where: { provider_externalId: { provider: string; externalId: string } } }) => db.grants.get(grantKey(where)) ?? null,
      upsert: async ({ where, create, update }: { where: { provider_externalId: { provider: string; externalId: string } }; create: Row; update: Row }) => {
        const k = grantKey(where);
        const prev = db.grants.get(k);
        const row = prev ? { ...prev, ...update, updatedAt: new Date() } : { id: `g${++db.seq}`, createdAt: new Date(), updatedAt: new Date(), appliedUserId: null, appliedAt: null, lastEventAt: null, ...create };
        db.grants.set(k, row);
        return row;
      },
      findMany: async ({ where }: { where: { email: string; appliedUserId: null } }) => [...db.grants.values()].filter((g) => g.email === where.email && g.appliedUserId == null),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const [k, g] = [...db.grants.entries()].find(([, v]) => v.id === where.id)!;
        const row = { ...g, ...data };
        db.grants.set(k, row);
        return row;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => [...db.users.values()].find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = { ...db.users.get(where.id), ...data };
        db.users.set(where.id, row);
        return row;
      },
    },
    subscription: {
      findUnique: async ({ where }: { where: { userId: string } }) => db.subs.get(where.userId) ?? null,
      upsert: async ({ where, create, update }: { where: { userId: string }; create: Row; update: Row }) => {
        const prev = db.subs.get(where.userId);
        const row = prev ? { ...prev, ...update } : { ...create };
        db.subs.set(where.userId, row);
        return row;
      },
    },
  };
  return { getPrisma: () => fake, requirePrisma: () => fake, DatabaseUnavailableError: class extends Error {} };
});
vi.mock("@/services/analytics-service", () => ({ track: vi.fn(async () => undefined), ANALYTICS_EVENTS: [] }));
vi.mock("@/services/email-service", () => ({ sendTemplate: vi.fn(async () => undefined) }));

import { resetEnvCache } from "@/lib/env";
import { POST } from "@/app/api/billing/kiwify/route";
import { applyPendingGrants } from "@/services/billing/kiwify";

const TOKEN = "token-de-teste-kiwify";
const ENV_KEYS = ["KIWIFY_WEBHOOK_TOKEN", "KIWIFY_PRODUCT_PRO_ID", "KIWIFY_PRODUCT_ELITE_ID"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function body(type: string, at: string, over: Row = {}): Row {
  return {
    order_id: "ord-1",
    webhook_event_type: type,
    updated_at: at,
    Product: { product_id: "prod-pro", product_name: "CryptoScanner PRO" },
    Customer: { email: "cliente@example.com" },
    Subscription: { id: "sub-1", next_payment: "2099-01-01T00:00:00.000Z" },
    ...over,
  };
}

async function hook(payload: Row, opts: { sig?: string | null } = {}) {
  const raw = JSON.stringify(payload);
  const sig = opts.sig === undefined ? createHmac("sha1", TOKEN).update(raw).digest("hex") : opts.sig;
  const url = `http://localhost/api/billing/kiwify${sig ? `?signature=${sig}` : ""}`;
  const res = await POST(new Request(url, { method: "POST", body: raw, headers: { "content-type": "application/json" } }), { params: Promise.resolve({}) });
  return { status: res.status, json: (await res.json()) as { ok: boolean; data?: Row; error?: { code: string } } };
}

const grant = () => db.grants.get("kiwify:sub-1");
const sub = (userId = "u1") => db.subs.get(userId);

describe("POST /api/billing/kiwify", () => {
  beforeEach(() => {
    db.billingEvents.clear();
    db.grants.clear();
    db.users.clear();
    db.subs.clear();
    db.users.set("u1", { id: "u1", email: "cliente@example.com", name: "Cliente", role: "USER", plan: "FREE" });
    process.env.KIWIFY_WEBHOOK_TOKEN = TOKEN;
    process.env.KIWIFY_PRODUCT_PRO_ID = "prod-pro";
    process.env.KIWIFY_PRODUCT_ELITE_ID = "prod-elite";
    resetEnvCache();
  });
  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetEnvCache();
  });

  it("assinatura válida libera o PRO na conta com o mesmo e-mail", async () => {
    const r = await hook(body("order_approved", "2026-09-01 10:00"));
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ processed: true, applied: true, status: "ACTIVE" });
    expect(sub()).toMatchObject({ plan: "PRO", status: "ACTIVE", provider: "kiwify", providerSubscriptionId: "kiwify:sub-1" });
    expect(db.users.get("u1")?.plan).toBe("PRO");
  });

  it("assinatura ausente ou errada: 401 e nada muda", async () => {
    expect((await hook(body("order_approved", "2026-09-01 10:00"), { sig: null })).status).toBe(401);
    expect((await hook(body("order_approved", "2026-09-01 10:00"), { sig: createHmac("sha1", "outro").update("x").digest("hex") })).status).toBe(401);
    expect(grant()).toBeUndefined();
    expect(sub()).toBeUndefined();
  });

  it("reentrega do mesmo corpo é marcada como duplicada", async () => {
    const p = body("order_approved", "2026-09-01 10:00");
    await hook(p);
    const again = await hook(p);
    expect(again.json.data).toEqual({ duplicate: true });
    expect(db.billingEvents.size).toBe(1);
  });

  it("produto desconhecido não libera acesso", async () => {
    const r = await hook(body("order_approved", "2026-09-01 10:00", { Product: { product_id: "curso", product_name: "Outro curso" } }));
    expect(r.json.data).toEqual({ ignored: "unknown_product" });
    expect(grant()).toBeUndefined();
    expect(sub()).toBeUndefined();
  });

  it("e-mail sem conta: concessão fica pendente e é aplicada no cadastro", async () => {
    const r = await hook(body("order_approved", "2026-09-01 10:00", { Customer: { email: "Novo@Example.com" } }));
    expect(r.json.data).toMatchObject({ processed: true, applied: false, status: "ACTIVE" });
    expect(grant()).toMatchObject({ email: "novo@example.com", appliedUserId: null, status: "ACTIVE" });
    db.users.set("u2", { id: "u2", email: "novo@example.com", name: "Novo", role: "USER", plan: "FREE" });
    expect(await applyPendingGrants("u2", "novo@example.com")).toBe(1);
    expect(sub("u2")).toMatchObject({ plan: "PRO", status: "ACTIVE" });
    expect(grant()?.appliedUserId).toBe("u2");
  });

  it("aprovado → atrasado → cancelado → reembolsado", async () => {
    await hook(body("order_approved", "2026-09-01 10:00"));
    expect(sub()?.status).toBe("ACTIVE");
    const end = sub()?.currentPeriodEnd as Date;
    await hook(body("subscription_late", "2026-10-02 10:00"));
    expect(sub()?.status).toBe("PAST_DUE");
    await hook(body("subscription_canceled", "2026-10-05 10:00"));
    expect(sub()).toMatchObject({ status: "CANCELLED", cancelAtPeriodEnd: true });
    expect(sub()?.currentPeriodEnd).toEqual(end);
    await hook(body("compra_reembolsada", "2026-10-06 10:00"));
    expect(sub()?.status).toBe("EXPIRED");
    expect(db.users.get("u1")?.plan).toBe("FREE");
  });

  it("aprovado antigo reenviado depois do reembolso não reativa o acesso", async () => {
    await hook(body("order_approved", "2026-09-01 10:00"));
    await hook(body("compra_reembolsada", "2026-09-03 10:00"));
    expect(sub()?.status).toBe("EXPIRED");
    // mesmo evento, corpo diferente (hash novo): não é pego pela idempotência
    const r = await hook({ ...body("order_approved", "2026-09-01 10:00"), resent: true });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ stale: true });
    expect(sub()?.status).toBe("EXPIRED");
    expect(grant()?.status).toBe("EXPIRED");
    expect(db.users.get("u1")?.plan).toBe("FREE");
  });

  it("renovação atrasada que chega depois do cancelamento é ignorada", async () => {
    await hook(body("order_approved", "2026-09-01 10:00"));
    await hook(body("subscription_canceled", "2026-10-05 10:00"));
    const r = await hook(body("subscription_renewed", "2026-10-01 10:00", { order_id: "ord-2" }));
    expect(r.json.data).toMatchObject({ stale: true });
    expect(sub()?.status).toBe("CANCELLED");
  });

  it("aprovado do mesmo pedido reembolsado, sem data no corpo, não reativa", async () => {
    await hook(body("order_approved", "2026-09-01 10:00"));
    await hook(body("compra_reembolsada", "2026-09-03 10:00"));
    const noDate = body("order_approved", "");
    delete noDate.updated_at;
    const r = await hook(noDate);
    expect(r.json.data).toMatchObject({ stale: true });
    expect(sub()?.status).toBe("EXPIRED");
  });

  it("evento mais novo continua aplicado normalmente (renovação depois do atraso)", async () => {
    await hook(body("order_approved", "2026-09-01 10:00"));
    await hook(body("subscription_late", "2026-10-02 10:00"));
    await hook(body("subscription_renewed", "2026-10-03 10:00", { order_id: "ord-2" }));
    expect(sub()?.status).toBe("ACTIVE");
    expect(grant()?.lastEventAt).toBeInstanceOf(Date);
  });
});
