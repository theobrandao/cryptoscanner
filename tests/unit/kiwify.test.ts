import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkKiwifySignature, grantStateFor, parseKiwifyEvent, planFromKiwify } from "@/services/billing/kiwify";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { billingNote, PLAN_FEATURES } from "@/lib/plans-copy";

const sample = {
  order_id: "ord-1",
  order_status: "paid",
  webhook_event_type: "order_approved",
  Product: { product_id: "prod-pro", product_name: "CryptoScanner PRO" },
  Customer: { email: "Comprador@Exemplo.com", full_name: "Fulano" },
  Subscription: { id: "sub-9", next_payment: "2026-10-29T12:00:00.000Z", plan: { name: "Mensal" } },
};

describe("Kiwify — leitura do evento", () => {
  it("lê pedido, e-mail (minúsculo), produto, assinatura e próxima cobrança", () => {
    const ev = parseKiwifyEvent(sample);
    expect(ev.kind).toBe("approved");
    expect(ev.orderId).toBe("ord-1");
    expect(ev.email).toBe("comprador@exemplo.com");
    expect(ev.productId).toBe("prod-pro");
    expect(ev.subscriptionId).toBe("sub-9");
    expect(ev.nextPayment?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
  });
  it("mapeia os gatilhos da API (português) e cai no order_status sem tipo", () => {
    expect(parseKiwifyEvent({ webhook_event_type: "compra_aprovada" }).kind).toBe("approved");
    expect(parseKiwifyEvent({ webhook_event_type: "subscription_renewed" }).kind).toBe("renewed");
    expect(parseKiwifyEvent({ webhook_event_type: "subscription_late" }).kind).toBe("late");
    expect(parseKiwifyEvent({ webhook_event_type: "subscription_canceled" }).kind).toBe("canceled");
    expect(parseKiwifyEvent({ webhook_event_type: "compra_reembolsada" }).kind).toBe("refunded");
    expect(parseKiwifyEvent({ webhook_event_type: "chargeback" }).kind).toBe("chargeback");
    expect(parseKiwifyEvent({ webhook_event_type: "pix_gerado", order_status: "waiting_payment" }).kind).toBe("ignored");
    expect(parseKiwifyEvent({ order_status: "refunded" }).kind).toBe("refunded");
    expect(parseKiwifyEvent({ foo: 1 }).kind).toBe("ignored");
  });
});

describe("Kiwify — plano da compra", () => {
  it("IDs diferentes: o ID do produto decide; outro produto → null", () => {
    const ids = { pro: "prod-pro", elite: "prod-elite" };
    expect(planFromKiwify({ productId: "prod-elite", productName: "x", planName: null }, ids)).toBe("ELITE");
    expect(planFromKiwify({ productId: "prod-pro", productName: "ELITE?", planName: null }, ids)).toBe("PRO");
    expect(planFromKiwify({ productId: "curso", productName: "Curso PRO", planName: null }, ids)).toBeNull();
  });
  it("mesmo produto com dois planos: decide o nome do plano", () => {
    const ids = { pro: "p1", elite: "p1" };
    expect(planFromKiwify({ productId: "p1", productName: "CryptoScanner", planName: "Plano ELITE mensal" }, ids)).toBe("ELITE");
    expect(planFromKiwify({ productId: "p1", productName: "CryptoScanner", planName: "PRO mensal" }, ids)).toBe("PRO");
  });
  it("sem IDs: nome; nome sem PRO/ELITE → null (não libera por engano)", () => {
    expect(planFromKiwify({ productId: "z", productName: "CryptoScanner ELITE", planName: null }, {})).toBe("ELITE");
    expect(planFromKiwify({ productId: "z", productName: "Produto", planName: null }, {})).toBeNull();
    expect(planFromKiwify({ productId: "z", productName: "Programa", planName: null }, {})).toBeNull();
  });
});

describe("Kiwify — assinatura do webhook", () => {
  const raw = JSON.stringify(sample);
  const token = "tok-teste-123";
  it("aceita HMAC-SHA1 hex do corpo com o token", () => {
    const sig = createHmac("sha1", token).update(raw).digest("hex");
    expect(checkKiwifySignature(raw, sig, token)).toEqual({ ok: true, variant: "sha1-raw" });
    expect(checkKiwifySignature(raw, sig.toUpperCase(), ` ${token} `).ok).toBe(true);
  });
  it("recusa sem token, sem assinatura, com assinatura errada — sem expor o token", () => {
    expect(checkKiwifySignature(raw, "abc", undefined)).toEqual({ ok: false, reason: "missing_token" });
    expect(checkKiwifySignature(raw, null, token)).toEqual({ ok: false, reason: "missing_signature" });
    const bad = checkKiwifySignature(raw, createHmac("sha1", "outro").update(raw).digest("hex"), token);
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain(token);
  });
  it("corpo alterado invalida a assinatura", () => {
    const sig = createHmac("sha1", token).update(raw).digest("hex");
    expect(checkKiwifySignature(raw.replace("ord-1", "ord-2"), sig, token).ok).toBe(false);
  });
});

describe("Kiwify — estado do acesso", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("aprovada/renovada: ativa até a próxima cobrança (ou +31 dias)", () => {
    expect(grantStateFor("approved", null, new Date("2026-10-29T12:00:00Z"), now)).toEqual({ status: "ACTIVE", currentPeriodEnd: new Date("2026-10-29T12:00:00Z") });
    expect(grantStateFor("renewed", null, null, now).currentPeriodEnd?.toISOString()).toBe("2026-10-30T12:00:00.000Z");
  });
  it("cancelada mantém o período pago; reembolso/chargeback encerram na hora", () => {
    const prev = { currentPeriodEnd: new Date("2026-10-10T00:00:00Z") };
    expect(grantStateFor("canceled", prev, null, now)).toEqual({ status: "CANCELLED", currentPeriodEnd: prev.currentPeriodEnd });
    expect(grantStateFor("refunded", prev, null, now)).toEqual({ status: "EXPIRED", currentPeriodEnd: now });
    expect(grantStateFor("chargeback", prev, null, now).status).toBe("EXPIRED");
    expect(grantStateFor("late", prev, null, now).status).toBe("PAST_DUE");
  });
});

describe("Teste grátis e textos de plano", () => {
  it("teste de 3 dias", () => expect(TRIAL_DAYS).toBe(3));
  it("recursos vêm dos limites do plano e nota da Kiwify cita o e-mail da compra", () => {
    expect(PLAN_FEATURES.PRO.some((f) => f.includes("5 monitores"))).toBe(true);
    expect(billingNote("kiwify")).toMatch(/mesmo e-mail/);
    expect(billingNote("mercadopago")).toMatch(/Mercado Pago/);
  });
});
