import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

/**
 * E-mail transacional via Resend (API REST). Sem RESEND_API_KEY/EMAIL_FROM: não envia e registra no log;
 * o app continua funcionando (avisos ficam in-app/push) e a recuperação de senha orienta a falar com o suporte.
 */
export function isEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ sent: boolean; id?: string; error?: string }> {
  const env = getEnv();
  if (!isEmailConfigured()) {
    log.info("e-mail não enviado (provedor não configurado)", { subject: msg.subject });
    return { sent: false, error: "email_not_configured" };
  }
  try {
    const r = await fetchJson<{ id: string }>("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(env.SUPPORT_EMAIL ? { reply_to: env.SUPPORT_EMAIL } : {}) }),
      retries: 1,
      timeoutMs: 10_000,
    });
    return { sent: true, id: r.id };
  } catch (err) {
    log.warn("falha no envio de e-mail", { subject: msg.subject, error: (err as Error).message });
    return { sent: false, error: (err as Error).message };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const env = getEnv();
  const foot = [env.LEGAL_ENTITY_NAME, env.LEGAL_ENTITY_DOC].filter(Boolean).join(" · ");
  const html = `<!doctype html><html><body style="margin:0;background:#07101a;font-family:Inter,Arial,sans-serif;color:#e6edf5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b1420;border:1px solid #1b2733;border-radius:10px">
<tr><td style="padding:24px 28px">
<div style="font-size:17px;font-weight:700;margin-bottom:16px">CryptoScanner</div>
<div style="font-size:18px;font-weight:700;margin-bottom:12px">${esc(title)}</div>
${paragraphs.map((p) => `<p style="font-size:14px;line-height:1.55;color:#c3cfdc;margin:0 0 12px">${esc(p)}</p>`).join("")}
${cta ? `<p style="margin:18px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#2f6bff;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px">${esc(cta.label)}</a></p>` : ""}
<p style="font-size:11px;color:#8193a8;margin:18px 0 0">Conteúdo técnico e educacional; não é recomendação de investimento.${foot ? ` ${esc(foot)}.` : ""}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : []), "", "Conteúdo técnico e educacional; não é recomendação de investimento."].join("\n");
  return { html, text };
}

export type TemplateKind = "welcome" | "trial_ending" | "trial_last_day" | "trial_ended" | "payment_failed" | "subscription_active" | "password_reset";

export async function sendTemplate(kind: TemplateKind, d: { to: string; name?: string; url?: string; plan?: string; daysLeft?: number }) {
  const app = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const hi = d.name ? `Olá, ${d.name.split(" ")[0]}.` : "Olá.";
  const plans = { label: "Ver planos", url: `${app}/planos` };
  const t: Record<TemplateKind, { subject: string; title: string; p: string[]; cta?: { label: string; url: string } }> = {
    welcome: {
      subject: "Seu teste de 7 dias do CryptoScanner começou",
      title: "Teste de 7 dias ativo",
      p: [hi, "Seu acesso completo vale por 7 dias: Dashboard com estrutura, liquidez e Confluence Score, Market Scanner, Market Monitor, Strategy Builder, Backtest com custos e derivativos de Binance, Bybit e OKX.", "Sugestão para o primeiro dia: escolha exchange e instrumento no Dashboard, crie um monitor para o seu ativo principal e salve uma estratégia a partir de um modelo."],
      cta: { label: "Abrir o Dashboard", url: `${app}/` },
    },
    trial_ending: { subject: `Seu teste termina em ${d.daysLeft ?? 2} dias`, title: `Faltam ${d.daysLeft ?? 2} dias do teste`, p: [hi, "Para manter monitores, estratégias e watchlists ativos depois do teste, escolha o plano PRO ou ELITE. Sem assinatura, os dados continuam salvos, mas o acesso ao workspace é pausado."], cta: plans },
    trial_last_day: { subject: "Último dia do seu teste", title: "Hoje é o último dia do teste", p: [hi, "Amanhã o acesso ao workspace é pausado. Seus dados continuam salvos e voltam a funcionar ao assinar."], cta: plans },
    trial_ended: { subject: "Seu teste terminou", title: "Teste encerrado", p: [hi, "Seu período de teste terminou. Monitores foram pausados; estratégias, watchlists e preferências continuam salvos."], cta: plans },
    payment_failed: { subject: "Pagamento não aprovado", title: "Não conseguimos processar o pagamento", p: [hi, "O Mercado Pago não aprovou a última cobrança da sua assinatura. Atualize o meio de pagamento para evitar a pausa do acesso após o período de tolerância."], cta: { label: "Revisar assinatura", url: `${app}/planos` } },
    subscription_active: { subject: `Assinatura ${d.plan ?? ""} ativa`, title: `Assinatura ${d.plan ?? ""} ativa`, p: [hi, "Pagamento confirmado. Seu acesso está ativo. Você pode cancelar a renovação a qualquer momento em Plans & Billing; o acesso segue até o fim do período pago."], cta: { label: "Abrir o Dashboard", url: `${app}/` } },
    password_reset: { subject: "Redefinição de senha", title: "Redefinir sua senha", p: [hi, "Recebemos um pedido para redefinir a senha da sua conta. O link vale por 60 minutos e pode ser usado uma vez. Se você não fez o pedido, ignore este e-mail."], cta: d.url ? { label: "Criar nova senha", url: d.url } : undefined },
  };
  const x = t[kind];
  const { html, text } = layout(x.title, x.p, x.cta);
  return sendEmail({ to: d.to, subject: x.subject, html, text });
}
