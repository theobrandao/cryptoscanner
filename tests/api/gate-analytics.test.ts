import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/analytics/event: nomes de conversão aceitos, propriedades filtradas e motivo de cancelamento validado.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, connection: async () => undefined };
});
const tracked = vi.hoisted(() => [] as Array<{ name: string; props: unknown }>);
vi.mock("@/services/analytics-service", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/services/analytics-service")>();
  return { ...mod, track: async (name: string, opts: { props?: unknown }) => void tracked.push({ name, props: opts.props }) };
});

import { getCache } from "@/lib/cache";
import { POST } from "@/app/api/analytics/event/route";
import { ANALYTICS_EVENTS, CANCEL_REASONS, CLIENT_ANALYTICS_EVENTS, sanitizeClientProps } from "@/services/analytics-service";

const send = async (body: unknown) => {
  const res = await POST(new Request("http://localhost/api/analytics/event", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}` } }), { params: Promise.resolve({}) });
  return { status: res.status, json: (await res.json()) as { ok: boolean } };
};

describe("eventos de conversão", () => {
  beforeEach(() => {
    tracked.length = 0;
    getCache()._clearMemory();
  });

  it("os seis nomes da frente de monetização existem no servidor e no cliente", () => {
    for (const n of ["cta_click", "signup_view", "gate_view", "trial_card_click", "onboarding_step", "cancel_reason"] as const) {
      expect(ANALYTICS_EVENTS).toContain(n);
      expect(CLIENT_ANALYTICS_EVENTS).toContain(n);
    }
    expect(CANCEL_REASONS.length).toBeGreaterThanOrEqual(5);
    expect(CANCEL_REASONS.length).toBeLessThanOrEqual(6);
  });

  it("gate_view grava a ferramenta e descarta chaves fora da lista", async () => {
    const r = await send({ name: "gate_view", anonId: "a1", props: { feature: "Scanner", state: "visitante", email: "x@example.com" } });
    expect(r.status).toBe(200);
    expect(tracked).toEqual([{ name: "gate_view", props: { feature: "Scanner", state: "visitante" } }]);
  });

  it("cta_click com origem", async () => {
    await send({ name: "cta_click", props: { origin: "hero" } });
    expect(tracked[0]).toEqual({ name: "cta_click", props: { origin: "hero" } });
  });

  it("cancel_reason só com motivo da lista", async () => {
    expect((await send({ name: "cancel_reason", props: { reason: "preco", plan: "PRO" } })).status).toBe(200);
    expect(tracked[0]).toEqual({ name: "cancel_reason", props: { reason: "preco", plan: "PRO" } });
    expect((await send({ name: "cancel_reason", props: { reason: "texto livre qualquer" } })).status).toBe(400);
    expect((await send({ name: "cancel_reason" })).status).toBe(400);
    expect(tracked.length).toBe(1);
  });

  it("nome fora da lista é recusado", async () => {
    expect((await send({ name: "subscription_activated" })).status).toBe(400);
    expect(tracked.length).toBe(0);
  });

  it("eventos antigos mantêm as propriedades livres curtas", () => {
    expect(sanitizeClientProps("context_change", { symbol: "BTC", tf: "4h" })).toEqual({ ok: true, props: { symbol: "BTC", tf: "4h" } });
    expect(sanitizeClientProps("gate_view", {})).toEqual({ ok: false });
  });
});
