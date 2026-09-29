import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Mercado Pago — assinaturas (preapproval) sem plano associado: valor e frequência vão na criação.
 * Docs: mercadopago.com.br/developers (Assinaturas / Webhooks, validação x-signature HMAC-SHA256).
 */
const API = "https://api.mercadopago.com";

export function isBillingConfigured(): boolean {
  return Boolean(getEnv().MERCADOPAGO_ACCESS_TOKEN);
}

async function mp<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const token = getEnv().MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Mercado Pago não configurado (MERCADOPAGO_ACCESS_TOKEN)");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mercado Pago HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  init_point?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount: number; currency_id: string; frequency: number; frequency_type: string };
}

export function priceFor(plan: "PRO" | "ELITE"): number {
  const env = getEnv();
  return plan === "ELITE" ? env.PRICE_ELITE_BRL : env.PRICE_PRO_BRL;
}

export async function createPreapproval(input: { userId: string; email: string; plan: "PRO" | "ELITE"; backUrl: string }): Promise<Preapproval> {
  return mp<Preapproval>(
    "POST",
    "/preapproval",
    {
      reason: `CryptoScanner ${input.plan} — mensal`,
      external_reference: `${input.userId}:${input.plan}`,
      payer_email: input.email,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: priceFor(input.plan), currency_id: "BRL" },
    },
    `checkout-${input.userId}-${input.plan}-${new Date().toISOString().slice(0, 13)}`,
  );
}

export const getPreapproval = (id: string) => mp<Preapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
export const cancelPreapproval = (id: string) => mp<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" });

/**
 * Valida x-signature ("ts=...,v1=...") com o manifesto `id:{data.id};request-id:{x-request-id};ts:{ts};`.
 * Sem MERCADOPAGO_WEBHOOK_SECRET o webhook é recusado (não processamos notificação não autenticada).
 */
export function verifyWebhookSignature(headers: Headers, dataId: string | null, now = Date.now()): boolean {
  const secret = getEnv().MERCADOPAGO_WEBHOOK_SECRET;
  const sig = headers.get("x-signature");
  const reqId = headers.get("x-request-id");
  if (!secret || !sig) return false;
  const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  // janela de 10 min contra replay
  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > 10 * 60_000) return false;
  let manifest = "";
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (reqId) manifest += `request-id:${reqId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mapeia o status do preapproval para o status da assinatura. */
export function mapPreapprovalStatus(s: Preapproval["status"]): "ACTIVE" | "PAST_DUE" | "CANCELLED" | null {
  if (s === "authorized") return "ACTIVE";
  if (s === "paused") return "PAST_DUE";
  if (s === "cancelled") return "CANCELLED";
  return null; // pending: nada muda até autorizar
}
