/**
 * Fluxo Kiwify ponta a ponta contra um ambiente com KIWIFY_WEBHOOK_TOKEN conhecido (local/teste — nunca produção).
 *   BASE_URL=http://localhost:3000 KIWIFY_WEBHOOK_TOKEN=... INVITE_CODE=... node tools/kiwify-flow.mjs
 * Compra antes do cadastro → cadastro aplica ELITE → reentrega idempotente → cancelamento mantém período →
 * reembolso corta acesso → assinatura inválida 401 → produto desconhecido e evento informativo ignorados.
 */
import { createHmac, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.KIWIFY_WEBHOOK_TOKEN;
const INVITE = process.env.INVITE_CODE;
if (!BASE || !TOKEN) {
  console.error("BASE_URL e KIWIFY_WEBHOOK_TOKEN obrigatórios");
  process.exit(2);
}
let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
};
const hook = async (payload, { sign = true, sig } = {}) => {
  const raw = JSON.stringify(payload);
  const s = sig ?? (sign ? createHmac("sha1", TOKEN).update(raw).digest("hex") : null);
  const res = await fetch(`${BASE}/api/billing/kiwify${s ? `?signature=${s}` : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const id = randomUUID().slice(0, 8);
const email = `kiwify+${id}@example.com`;
const sub = `sub-${id}`;
const base = (type, order, extra = {}) => ({
  order_id: order,
  order_status: type === "order_refunded" ? "refunded" : "paid",
  webhook_event_type: type,
  Product: { product_id: "prod-test", product_name: "CryptoScanner ELITE" },
  Customer: { email: email.toUpperCase(), full_name: "Teste Kiwify" },
  Subscription: { id: sub, next_payment: new Date(Date.now() + 30 * 86400000).toISOString() },
  ...extra,
});

// 1. compra antes da conta existir
const approved = base("order_approved", `ord-${id}-1`);
let r = await hook(approved);
ok(r.status === 200 && r.json?.data?.processed && r.json.data.applied === false, `compra antes do cadastro → pendente (${r.status} ${JSON.stringify(r.json?.data)})`);
r = await hook(approved);
ok(r.status === 200 && r.json?.data?.duplicate === true, "reentrega idêntica → duplicate");

// 2. cadastro com o mesmo e-mail aplica ELITE
const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Teste Kiwify", email, password: "Kiwify!Teste123", acceptTerms: true, ...(INVITE ? { invite: INVITE } : {}) }) });
const cookie = (reg.headers.get("set-cookie") ?? "").split(";")[0];
ok(reg.status === 201 && cookie, `cadastro ${reg.status}`);
const access = async () => (await (await fetch(`${BASE}/api/billing/subscription`, { headers: { cookie } })).json()).data;
let a = await access();
ok(a.tier === "ELITE" && a.status === "ACTIVE" && a.provider === "kiwify", `após cadastro: ${a.tier} ${a.status} ${a.provider}`);

// 3. cancelamento: mantém acesso até o fim do período
r = await hook(base("subscription_canceled", `ord-${id}-1`, { order_status: "paid" }));
a = await access();
ok(r.status === 200 && a.status === "CANCELLED" && a.tier === "ELITE", `cancelada mantém ELITE até ${a.currentPeriodEnd?.slice(0, 10)}`);

// 4. renovação reativa
r = await hook(base("subscription_renewed", `ord-${id}-2`));
a = await access();
ok(a.status === "ACTIVE", `renovada → ${a.status}`);

// 5. reembolso corta o acesso
r = await hook(base("order_refunded", `ord-${id}-2`));
a = await access();
ok(a.tier === "NONE" && a.status === "EXPIRED", `reembolso → ${a.tier} ${a.status}`);
const sig = await fetch(`${BASE}/api/signals/breakout`, { headers: { cookie } });
ok(sig.status === 402, `sinais sem plano → ${sig.status}`);

// 6. autenticidade
r = await hook(approved, { sign: false });
ok(r.status === 401, `sem assinatura → ${r.status}`);
r = await hook(approved, { sig: createHmac("sha1", "outro-token").update(JSON.stringify(approved)).digest("hex") });
ok(r.status === 401, `assinatura com outro token → ${r.status}`);

// 7. produto fora do CryptoScanner e evento informativo
r = await hook({ ...base("order_approved", `ord-${id}-3`), Product: { product_id: "curso", product_name: "Outro produto" } });
ok(r.status === 200 && r.json?.data?.ignored === "unknown_product", `produto desconhecido → ${JSON.stringify(r.json?.data)}`);
r = await hook({ ...base("pix_gerado", `ord-${id}-4`), order_status: "waiting_payment" });
ok(r.status === 200 && r.json?.data?.ignored, `pix gerado → ignorado`);

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
