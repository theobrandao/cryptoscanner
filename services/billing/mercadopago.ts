import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cached } from "@/lib/cache";
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

export interface BillingAccount {
  ok: boolean;
  error?: string;
  /** APP_USR- = produção · TEST- = sandbox */
  tokenKind: "production" | "test" | "unknown" | "missing";
  nickname?: string;
  name?: string;
  siteId?: string;
  /** CPF ou CNPJ do titular da conta (só o tipo e os 2 últimos dígitos) */
  docType?: string;
  docLast2?: string;
  testUser?: boolean;
}

/**
 * Confere o Access Token chamando GET /users/me (sem efeito colateral) e devolve o titular da conta,
 * para confirmar que o dinheiro cai na conta certa. Cache de 10 min por token (hash).
 */
export async function verifyBillingAccount(): Promise<BillingAccount> {
  const token = getEnv().MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return { ok: false, tokenKind: "missing", error: "MERCADOPAGO_ACCESS_TOKEN ausente" };
  const tokenKind = token.startsWith("APP_USR-") ? "production" : token.startsWith("TEST-") ? "test" : "unknown";
  const key = `mp:account:v1:${createHash("sha256").update(token).digest("hex").slice(0, 12)}`;
  const res = await cached(key, 600, async (): Promise<BillingAccount> => {
    try {
      const me = await mp<{ nickname?: string; first_name?: string; last_name?: string; site_id?: string; identification?: { type?: string; number?: string }; tags?: string[] }>("GET", "/users/me");
      const num = (me.identification?.number ?? "").replace(/\D/g, "");
      return {
        ok: true,
        tokenKind,
        nickname: me.nickname,
        name: [me.first_name, me.last_name].filter(Boolean).join(" ") || undefined,
        siteId: me.site_id,
        docType: me.identification?.type,
        docLast2: num ? num.slice(-2) : undefined,
        testUser: (me.tags ?? []).includes("test_user") || /^TEST/i.test(me.nickname ?? ""),
      };
    } catch (err) {
      return { ok: false, tokenKind, error: (err as Error).message.slice(0, 200) };
    }
  });
  return res.value;
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
export type SignatureCheck = { ok: true } | { ok: false; reason: "no_secret" | "no_signature" | "bad_format" | "stale_ts" | "mismatch"; detail?: Record<string, unknown> };

export function checkWebhookSignature(headers: Headers, dataId: string | null, now = Date.now()): SignatureCheck {
  // valor colado no painel pode trazer espaço/quebra de linha
  const secret = getEnv().MERCADOPAGO_WEBHOOK_SECRET?.trim();
  const sig = headers.get("x-signature");
  const reqId = headers.get("x-request-id");
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!sig) return { ok: false, reason: "no_signature" };
  const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=", 2).map((x) => x.trim()) as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, reason: "bad_format" };
  // janela de 10 min contra replay
  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > 10 * 60_000) return { ok: false, reason: "stale_ts", detail: { skewS: Math.round((now - tsMs) / 1000) } };
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (reqId) manifest += `request-id:${reqId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1.toLowerCase());
  if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
  // diagnóstico sem expor o segredo: tamanho e impressão curta (sha256) do segredo configurado
  return { ok: false, reason: "mismatch", detail: { hasRequestId: Boolean(reqId), dataId, secretLen: secret.length, secretFp: createHash("sha256").update(secret).digest("hex").slice(0, 8) } };
}

export function verifyWebhookSignature(headers: Headers, dataId: string | null, now = Date.now()): boolean {
  return checkWebhookSignature(headers, dataId, now).ok;
}

/** Mapeia o status do preapproval para o status da assinatura. */
export function mapPreapprovalStatus(s: Preapproval["status"]): "ACTIVE" | "PAST_DUE" | "CANCELLED" | null {
  if (s === "authorized") return "ACTIVE";
  if (s === "paused") return "PAST_DUE";
  if (s === "cancelled") return "CANCELLED";
  return null; // pending: nada muda até autorizar
}
