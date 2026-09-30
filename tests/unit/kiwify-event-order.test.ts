import { describe, expect, it } from "vitest";
import { isStaleKiwifyEvent, parseKiwifyEvent } from "@/services/billing/kiwify";

describe("Kiwify — data do evento", () => {
  it("lê updated_at (ou a data do tipo do evento) e trata data sem fuso como horário de Brasília", () => {
    expect(parseKiwifyEvent({ updated_at: "2026-09-01 10:00" }).eventAt?.toISOString()).toBe("2026-09-01T13:00:00.000Z");
    expect(parseKiwifyEvent({ approved_date: "2026-09-01T10:00:00Z" }).eventAt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(parseKiwifyEvent({ refunded_at: "2026-09-02 08:30:15" }).eventAt?.toISOString()).toBe("2026-09-02T11:30:15.000Z");
    expect(parseKiwifyEvent({ created_at: "2026-09-01 09:00", updated_at: "2026-09-03 09:00" }).eventAt?.toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });
  it("sem data ou data inválida → null", () => {
    expect(parseKiwifyEvent({}).eventAt).toBeNull();
    expect(parseKiwifyEvent({ updated_at: "ontem" }).eventAt).toBeNull();
  });
});

describe("Kiwify — evento fora de ordem", () => {
  const prev = { lastEventAt: new Date("2026-09-03T12:00:00Z"), status: "EXPIRED", lastOrderId: "ord-1" };
  it("evento mais antigo que o último aplicado é ignorado", () => {
    expect(isStaleKiwifyEvent(prev, { kind: "approved", eventAt: new Date("2026-09-01T12:00:00Z"), orderId: "ord-9" })).toBe(true);
  });
  it("evento mais novo ou na mesma data é aplicado", () => {
    expect(isStaleKiwifyEvent({ ...prev, status: "CANCELLED" }, { kind: "renewed", eventAt: new Date("2026-09-04T12:00:00Z"), orderId: "ord-2" })).toBe(false);
    expect(isStaleKiwifyEvent({ ...prev, status: "PAST_DUE" }, { kind: "renewed", eventAt: prev.lastEventAt, orderId: "ord-2" })).toBe(false);
  });
  it("aprovação do mesmo pedido já reembolsado nunca reativa, mesmo sem data", () => {
    expect(isStaleKiwifyEvent(prev, { kind: "approved", eventAt: null, orderId: "ord-1" })).toBe(true);
    expect(isStaleKiwifyEvent(prev, { kind: "renewed", eventAt: new Date("2026-09-10T12:00:00Z"), orderId: "ord-1" })).toBe(true);
    // pedido novo sem data: aplica (compra nova)
    expect(isStaleKiwifyEvent(prev, { kind: "approved", eventAt: null, orderId: "ord-2" })).toBe(false);
  });
  it("primeira concessão nunca é antiga", () => {
    expect(isStaleKiwifyEvent(null, { kind: "approved", eventAt: new Date("2020-01-01T00:00:00Z"), orderId: "x" })).toBe(false);
  });
});
