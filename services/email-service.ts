import { getEnv, legalDocKind } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { createLogger } from "@/lib/logger";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { SUPPORT_PATHS } from "@/lib/plans-copy";

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
  // CPF não vai no rodapé de e-mail (dado pessoal); CNPJ sim
  const foot = [env.LEGAL_ENTITY_NAME, legalDocKind(env.LEGAL_ENTITY_DOC) === "CNPJ" ? env.LEGAL_ENTITY_DOC : undefined].filter(Boolean).join(" · ");
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

/** Data e hora de um aviso no fuso de Brasília, ex.: "02/10 às 14:30". */
export function formatNoticeTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")} às ${get("hour")}:${get("minute")}`;
}

export async function sendTemplate(kind: TemplateKind, d: { to: string; name?: string; url?: string; plan?: string; endsAt?: Date }) {
  const app = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const hi = d.name ? `Olá, ${d.name.split(" ")[0]}.` : "Olá.";
  const plans = { label: "Ver planos", url: `${app}/planos` };
  const t: Record<TemplateKind, { subject: string; title: string; p: string[]; cta?: { label: string; url: string } }> = {
    welcome: {
      subject: `Seu teste grátis de ${TRIAL_DAYS} dias do CryptoScanner começou`,
      title: `Teste de ${TRIAL_DAYS} dias ativo (PRO)`,
      p: [hi, `Seu acesso ao PRO vale por ${TRIAL_DAYS} dias: Scanner de padrões, Agentes IA, Sentinela, Gráficos, sinais do modelo de rompimento, Construtor de estratégias, Backtest com custos e Derivativos.`, "Sugestão para o primeiro dia: veja os sinais ativos no Início, crie um agente para o seu ativo principal e ative as notificações."],
      cta: { label: "Abrir o Início", url: `${app}/` },
    },
    trial_ending: {
      subject: `Seu teste do PRO termina em ${d.endsAt ? formatNoticeTime(d.endsAt) : "breve"}`,
      title: `Seu teste termina em ${d.endsAt ? formatNoticeTime(d.endsAt) : "breve"}`,
      p: [hi, "Até lá, tudo do PRO continua liberado. Depois, o acesso às ferramentas fica pausado até você escolher um plano; agentes, monitores, favoritos e estratégias continuam salvos na sua conta.", "Se ainda não viu, confira os sinais do modelo no Início e crie um agente para o ativo que você acompanha."],
      cta: plans,
    },
    trial_last_day: {
      subject: "Últimas horas do seu teste do PRO",
      title: d.endsAt ? `Seu teste termina em ${formatNoticeTime(d.endsAt)}` : "Seu teste termina em poucas horas",
      p: [hi, "Para continuar com agentes, alertas e scanner sem interrupção, escolha o PRO ou o ELITE em Planos.", "Na primeira contratação, você pode desistir em até 7 dias e recebe o valor integral de volta.", "Se algo ficou faltando no teste, conte para nós pela página Suporte."],
      cta: plans,
    },
    trial_ended: { subject: "Seu teste terminou", title: "Teste encerrado", p: [hi, "O acesso às ferramentas foi pausado e os monitores foram desligados. Agentes, estratégias, favoritos e preferências continuam salvos e voltam a funcionar quando você assinar."], cta: plans },
    payment_failed: { subject: "Pagamento não aprovado", title: "Não conseguimos processar o pagamento", p: [hi, "A última cobrança da sua assinatura não foi aprovada. Atualize o meio de pagamento para evitar a pausa do acesso após o período de tolerância."], cta: { label: "Resolver pagamento", url: `${app}${SUPPORT_PATHS.payment}` } },
    subscription_active: { subject: `Assinatura ${d.plan ?? ""} ativa`, title: `Assinatura ${d.plan ?? ""} ativa`, p: [hi, "Pagamento confirmado. Seu acesso está ativo. Você pode cancelar a renovação a qualquer momento em Planos; o acesso segue até o fim do período pago."], cta: { label: "Abrir o Início", url: `${app}/` } },
    password_reset: { subject: "Redefinição de senha", title: "Redefinir sua senha", p: [hi, "Recebemos um pedido para redefinir a senha da sua conta. O link vale por 60 minutos e pode ser usado uma vez. Se você não fez o pedido, ignore este e-mail."], cta: d.url ? { label: "Criar nova senha", url: d.url } : undefined },
  };
  const x = t[kind];
  const { html, text } = layout(x.title, x.p, x.cta);
  return sendEmail({ to: d.to, subject: x.subject, html, text });
}
