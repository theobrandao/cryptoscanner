import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/database/client";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { track } from "@/services/analytics-service";
import { sendTemplate } from "@/services/email-service";
import { legacyPlanForSalePlan } from "@/lib/access-policy";

/**
 * Kiwify — venda do acesso por links de checkout da Kiwify.
 *  - Webhook (Apps › Webhooks): gatilhos compra_aprovada, subscription_renewed, subscription_late, subscription_canceled,
 *    compra_reembolsada e chargeback (nomes da API pública: docs.kiwify.com.br/api-reference/webhooks/create).
 *  - Autenticidade: parâmetro `signature` = HMAC-SHA1 do corpo com o token do webhook. A Kiwify não publica o formato;
 *    o log registra qual variante conferiu para ajustar pelo botão "Testar webhook" do painel.
 *  - Com KIWIFY_CLIENT_ID/SECRET/ACCOUNT_ID, a venda aprovada é relida em GET /v1/sales/{id} (API oficial) antes de liberar.
 *  - O acesso é ligado ao e-mail do comprador: aplicado na hora se a conta existe, ou no cadastro/login com o mesmo e-mail.
 */
const log = createLogger("kiwify");
const API = "https://public-api.kiwify.com";

export type Plan = "PRO" | "ELITE";
export type KiwifyEventKind = "approved" | "renewed" | "late" | "canceled" | "refunded" | "chargeback" | "ignored";

const TYPE_MAP: Record<string, KiwifyEventKind> = {
  compra_aprovada: "approved",
  order_approved: "approved",
  subscription_renewed: "renewed",
  subscription_late: "late",
  subscription_canceled: "canceled",
  compra_reembolsada: "refunded",
  order_refunded: "refunded",
  chargeback: "chargeback",
  // informativos: não mudam acesso
  boleto_gerado: "ignored",
  pix_gerado: "ignored",
  carrinho_abandonado: "ignored",
  compra_recusada: "ignored",
  billet_created: "ignored",
  pix_created: "ignored",
  order_rejected: "ignored",
};
const STATUS_MAP: Record<string, KiwifyEventKind> = { paid: "approved", approved: "approved", refunded: "refunded", chargedback: "chargeback", chargeback: "chargeback" };

export interface ParsedKiwifyEvent {
  kind: KiwifyEventKind;
  /** tipo como veio (webhook_event_type/order_status) */
  rawType: string;
  orderId: string | null;
  email: string | null;
  productId: string | null;
  productName: string | null;
  planName: string | null;
  subscriptionId: string | null;
  nextPayment: Date | null;
  /** data do evento no corpo (ordena reentregas fora de ordem); null quando o corpo não traz data */
  eventAt: Date | null;
}

type Json = Record<string, unknown>;

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

function str(obj: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const v = at(obj, p);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Data da Kiwify; sem fuso ("2026-09-01 10:00") é tratada como horário de Brasília (-03:00). Só serve para ordenar eventos. */
export function parseKiwifyDate(v: string | null): Date | null {
  if (!v) return null;
  const t = v.trim();
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?(\.\d+)?$/.exec(t);
  const d = local ? new Date(`${local[1]}T${local[2]}${local[3] ?? ":00"}${local[4] ?? ""}-03:00`) : /^\d{4}-\d{2}-\d{2}T/.test(t) ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Lê o evento com tolerância a variações de nome de campo (a Kiwify não publica o esquema do webhook de vendas). */
export function parseKiwifyEvent(body: unknown): ParsedKiwifyEvent {
  const typeRaw = str(body, ["webhook_event_type", "event", "trigger", "type"]);
  const statusRaw = str(body, ["order_status", "status", "Order.status", "order.status"]);
  const byType = typeRaw ? TYPE_MAP[typeRaw.toLowerCase()] : undefined;
  const byStatus = statusRaw ? STATUS_MAP[statusRaw.toLowerCase()] : undefined;
  const next = str(body, ["Subscription.next_payment", "subscription.next_payment", "next_payment"]);
  const nextDate = next ? new Date(next) : null;
  const email = str(body, ["Customer.email", "customer.email", "email", "Customer.Email"]);
  return {
    kind: byType ?? byStatus ?? "ignored",
    rawType: typeRaw ?? statusRaw ?? "unknown",
    orderId: str(body, ["order_id", "Order.id", "order.id", "sale_id", "id"]),
    email: email ? email.toLowerCase() : null,
    productId: str(body, ["Product.product_id", "Product.id", "product.id", "product_id"]),
    productName: str(body, ["Product.product_name", "Product.name", "product.name", "product_name"]),
    planName: str(body, ["Subscription.plan.name", "subscription.plan.name", "plan.name", "Product.plan_name"]),
    subscriptionId: str(body, ["subscription_id", "Subscription.id", "subscription.id"]),
    nextPayment: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate : null,
    eventAt: parseKiwifyDate(str(body, ["updated_at", "Order.updated_at", "order.updated_at", "refunded_at", "approved_date", "Order.approved_date", "created_at", "Order.created_at", "order.created_at"])),
  };
}

/**
 * Evento fora de ordem: mais antigo que o último aplicado na mesma assinatura, ou aprovação/renovação do mesmo pedido
 * que já foi reembolsado/estornado (vale mesmo sem data no corpo). Evento na mesma data do último é aplicado.
 */
export function isStaleKiwifyEvent(prev: { lastEventAt: Date | null; status: string; lastOrderId: string | null } | null, ev: { kind: Exclude<KiwifyEventKind, "ignored">; eventAt: Date | null; orderId: string | null }): boolean {
  if (!prev) return false;
  if (prev.lastEventAt && ev.eventAt && ev.eventAt.getTime() < prev.lastEventAt.getTime()) return true;
  return prev.status === "EXPIRED" && (ev.kind === "approved" || ev.kind === "renewed") && Boolean(ev.orderId) && ev.orderId === prev.lastOrderId;
}

/**
 * Plano da compra. Com os dois IDs configurados e diferentes, o ID do produto decide (outro produto → null).
 * Mesmo produto com dois planos (ou IDs não configurados): decide o nome do plano/produto (ELITE ou PRO).
 */
export function planFromKiwify(ev: Pick<ParsedKiwifyEvent, "productId" | "productName" | "planName">, ids: { pro?: string; elite?: string }): Plan | null {
  const { pro, elite } = ids;
  if (pro && elite && pro !== elite) {
    if (ev.productId === elite) return "ELITE";
    if (ev.productId === pro) return "PRO";
    return null;
  }
  if ((pro || elite) && ev.productId && ev.productId !== pro && ev.productId !== elite) return null;
  const text = `${ev.planName ?? ""} ${ev.productName ?? ""}`.toUpperCase();
  if (/\bELITE\b/.test(text)) return "ELITE";
  if (/\bPRO\b/.test(text)) return "PRO";
  if (pro && !elite && ev.productId === pro) return "PRO";
  if (elite && !pro && ev.productId === elite) return "ELITE";
  return null;
}

export type SignatureCheck = { ok: true; variant: string } | { ok: false; reason: "missing_token" | "missing_signature" | "mismatch"; detail?: Record<string, string> };

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** HMAC-SHA1(corpo bruto, token) em hex; reserva: corpo re-serializado e SHA-256 (registra qual conferiu). */
export function checkKiwifySignature(raw: string, signature: string | null, token: string | undefined): SignatureCheck {
  const secret = token?.trim();
  if (!secret) return { ok: false, reason: "missing_token" };
  const sig = signature?.trim().toLowerCase();
  if (!sig) return { ok: false, reason: "missing_signature" };
  let reserialized: string | null = null;
  try {
    reserialized = JSON.stringify(JSON.parse(raw));
  } catch {
    reserialized = null;
  }
  const variants: Array<[string, string]> = [
    ["sha1-raw", createHmac("sha1", secret).update(raw).digest("hex")],
    ...(reserialized && reserialized !== raw ? ([["sha1-json", createHmac("sha1", secret).update(reserialized).digest("hex")]] as Array<[string, string]>) : []),
    ["sha256-raw", createHmac("sha256", secret).update(raw).digest("hex")],
  ];
  for (const [name, expected] of variants) if (safeEq(expected, sig)) return { ok: true, variant: name };
  return { ok: false, reason: "mismatch", detail: { sigLen: String(sig.length), tokenFp: createHash("sha256").update(secret).digest("hex").slice(0, 8), bodyLen: String(raw.length) } };
}

export interface GrantState {
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  currentPeriodEnd: Date | null;
}

/** Estado do acesso após o evento. Renovação sem próxima data conhecida: +31 dias. */
export function grantStateFor(kind: Exclude<KiwifyEventKind, "ignored">, prev: { currentPeriodEnd: Date | null } | null, nextPayment: Date | null, now = new Date()): GrantState {
  const monthAhead = new Date(now.getTime() + 31 * 86_400_000);
  switch (kind) {
    case "approved":
    case "renewed":
      return { status: "ACTIVE", currentPeriodEnd: nextPayment && nextPayment > now ? nextPayment : monthAhead };
    case "late":
      return { status: "PAST_DUE", currentPeriodEnd: prev?.currentPeriodEnd ?? now };
    case "canceled":
      // acesso até o fim do período já pago
      return { status: "CANCELLED", currentPeriodEnd: prev?.currentPeriodEnd && prev.currentPeriodEnd > now ? prev.currentPeriodEnd : now };
    case "refunded":
    case "chargeback":
      return { status: "EXPIRED", currentPeriodEnd: now };
  }
}

export function kiwifyCheckoutUrl(plan: Plan): string | null {
  const env = getEnv();
  const raw = plan === "PRO" ? env.KIWIFY_CHECKOUT_PRO_URL : env.KIWIFY_CHECKOUT_ELITE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || !(host === "kiwify.com.br" || host.endsWith(".kiwify.com.br") || host === "kiwify.com" || host.endsWith(".kiwify.com"))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isKiwifyConfigured(): boolean {
  return Boolean(getEnv().KIWIFY_WEBHOOK_TOKEN && kiwifyCheckoutUrl("PRO") && kiwifyCheckoutUrl("ELITE"));
}

export function isKiwifyApiConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.KIWIFY_CLIENT_ID && e.KIWIFY_CLIENT_SECRET && e.KIWIFY_ACCOUNT_ID);
}

let apiToken: { value: string; exp: number } | null = null;

async function kiwifyToken(): Promise<string> {
  if (apiToken && apiToken.exp > Date.now() + 60_000) return apiToken.value;
  const e = getEnv();
  const res = await fetch(`${API}/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.KIWIFY_CLIENT_ID ?? "", client_secret: e.KIWIFY_CLIENT_SECRET ?? "" }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kiwify OAuth HTTP ${res.status}`);
  const j = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Kiwify OAuth sem access_token");
  apiToken = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 86_400) * 1000 };
  return apiToken.value;
}

export interface KiwifySale {
  status: string | null;
  email: string | null;
  productId: string | null;
  productName: string | null;
}

/** GET /v1/sales/{id} (API oficial): fonte de verdade da venda. */
export async function getKiwifySale(orderId: string): Promise<KiwifySale> {
  const token = await kiwifyToken();
  const res = await fetch(`${API}/v1/sales/${encodeURIComponent(orderId)}`, {
    headers: { authorization: `Bearer ${token}`, "x-kiwify-account-id": getEnv().KIWIFY_ACCOUNT_ID ?? "" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kiwify HTTP ${res.status}: ${text.slice(0, 200)}`);
  const s = JSON.parse(text) as unknown;
  const email = str(s, ["customer.email"]);
  return { status: str(s, ["status"]), email: email ? email.toLowerCase() : null, productId: str(s, ["product.id"]), productName: str(s, ["product.name"]) };
}

export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 10);
}

/** Aplica a concessão à conta (assinatura = fonte de verdade do acesso). Reembolso só derruba a assinatura da própria concessão. */
async function applyToUser(userId: string, grant: { externalId: string; plan: string; status: string; currentPeriodEnd: Date | null; lastEvent: string }) {
  const prisma = getPrisma();
  if (!prisma) return;
  const providerSubscriptionId = `kiwify:${grant.externalId}`;
  const before = await prisma.subscription.findUnique({ where: { userId }, select: { status: true, plan: true, providerSubscriptionId: true } });
  if (grant.status === "EXPIRED" && before && before.providerSubscriptionId !== providerSubscriptionId) return;
  const data = { plan: grant.plan, status: grant.status, provider: "kiwify", providerSubscriptionId, currentPeriodEnd: grant.currentPeriodEnd, cancelAtPeriodEnd: grant.status === "CANCELLED", lastPaymentStatus: grant.lastEvent };
  await prisma.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const legacy = current?.role === "ADMIN" ? {} : grant.status === "ACTIVE" ? { plan: legacyPlanForSalePlan(grant.plan) } : grant.status === "EXPIRED" ? { plan: "FREE" as const } : {};
  const u = await prisma.user.update({ where: { id: userId }, data: legacy, select: { email: true, name: true } });
  if (before?.status !== grant.status || before?.plan !== grant.plan) {
    if (grant.status === "ACTIVE") {
      await track("subscription_activated", { userId, props: { plan: grant.plan, provider: "kiwify" } });
      void sendTemplate("subscription_active", { to: u.email, name: u.name, plan: grant.plan }).catch(() => undefined);
    } else if (grant.status === "PAST_DUE") {
      await track("payment_failed", { userId, props: { plan: grant.plan, provider: "kiwify" } });
      void sendTemplate("payment_failed", { to: u.email, name: u.name }).catch(() => undefined);
    } else if (grant.status === "CANCELLED" || grant.status === "EXPIRED") await track("subscription_cancelled", { userId, props: { plan: grant.plan, provider: "kiwify", status: grant.status } });
  }
}

/**
 * Registra a compra pelo e-mail e aplica à conta, se existir. Devolve o userId quando aplicou.
 * Evento mais antigo que o último aplicado (ou aprovação de pedido já reembolsado) não muda nada: `stale: true`.
 */
export async function recordKiwifyGrant(input: { externalId: string; email: string; plan: Plan; kind: Exclude<KiwifyEventKind, "ignored">; orderId: string | null; nextPayment: Date | null; eventAt?: Date | null }): Promise<{ userId: string | null; status: string; stale?: boolean }> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Banco indisponível");
  const email = input.email.toLowerCase();
  const prev = await prisma.externalGrant.findUnique({ where: { provider_externalId: { provider: "kiwify", externalId: input.externalId } } });
  if (isStaleKiwifyEvent(prev, { kind: input.kind, eventAt: input.eventAt ?? null, orderId: input.orderId })) {
    log.warn("evento fora de ordem ignorado", { externalId: input.externalId, kind: input.kind, eventAt: input.eventAt?.toISOString() ?? null, lastEventAt: prev?.lastEventAt?.toISOString() ?? null, status: prev?.status });
    return { userId: prev?.appliedUserId ?? null, status: prev!.status, stale: true };
  }
  // só datas do próprio evento entram na ordenação (hora de recebimento misturaria relógios); nunca volta a data já gravada
  const eventAt = input.eventAt ?? null;
  const lastEventAt = eventAt && !(prev?.lastEventAt && prev.lastEventAt > eventAt) ? eventAt : (prev?.lastEventAt ?? null);
  const state = grantStateFor(input.kind, prev, input.nextPayment);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const grant = await prisma.externalGrant.upsert({
    where: { provider_externalId: { provider: "kiwify", externalId: input.externalId } },
    create: { provider: "kiwify", externalId: input.externalId, email, plan: input.plan, status: state.status, currentPeriodEnd: state.currentPeriodEnd, lastEvent: input.kind, lastEventAt, lastOrderId: input.orderId, appliedUserId: user?.id ?? null, appliedAt: user ? new Date() : null },
    update: { email, plan: input.plan, status: state.status, currentPeriodEnd: state.currentPeriodEnd, lastEvent: input.kind, lastEventAt, lastOrderId: input.orderId ?? prev?.lastOrderId ?? null, ...(user ? { appliedUserId: user.id, appliedAt: new Date() } : {}) },
  });
  if (user) await applyToUser(user.id, grant);
  log.info("concessão registrada", { externalId: input.externalId, kind: input.kind, plan: input.plan, status: state.status, applied: Boolean(user), emailFp: emailFingerprint(email) });
  return { userId: user?.id ?? null, status: state.status };
}

/** Cadastro/login: aplica compras feitas antes da conta existir (mesmo e-mail). */
export async function applyPendingGrants(userId: string, email: string): Promise<number> {
  const prisma = getPrisma();
  if (!prisma) return 0;
  const grants = await prisma.externalGrant.findMany({ where: { email: email.toLowerCase(), appliedUserId: null }, orderBy: { updatedAt: "asc" } });
  for (const g of grants) {
    await applyToUser(userId, g);
    await prisma.externalGrant.update({ where: { id: g.id }, data: { appliedUserId: userId, appliedAt: new Date() } });
  }
  if (grants.length) log.info("concessões pendentes aplicadas", { userId, count: grants.length });
  return grants.length;
}
