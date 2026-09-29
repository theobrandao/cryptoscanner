import { requirePrisma } from "@/database/client";
import { getEnv, isRegistrationOpen, legalStatus } from "@/lib/env";
import { effectiveStatus } from "@/lib/entitlements";
import { isBillingConfigured, priceFor, verifyBillingAccount } from "@/services/billing/mercadopago";
import { isEmailConfigured } from "@/services/email-service";
import { isPushConfigured } from "@/services/push-service";

/** Visão do dono: base de usuários, trials, assinaturas, MRR, funil e prontidão para vender. */
export async function getAdminOverview() {
  const prisma = requirePrisma();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const [users, signups7, signups30, subs, events30, billing, openTickets, recentUsers, monitors, strategies] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.subscription.findMany({ select: { plan: true, status: true, trialEndsAt: true, currentPeriodEnd: true, provider: true, trialStartedAt: true, updatedAt: true, createdAt: true } }),
    prisma.analyticsEvent.groupBy({ by: ["name"], where: { createdAt: { gte: d30 } }, _count: { _all: true } }),
    prisma.billingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { type: true, resourceId: true, processed: true, error: true, createdAt: true } }),
    prisma.supportTicket.count({ where: { status: "open" } }).catch(() => 0),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { email: true, createdAt: true, role: true, subscription: { select: { status: true, plan: true } } } }),
    prisma.monitor.count({ where: { active: true } }),
    prisma.strategy.count(),
  ]);
  const eff = subs.map((s) => ({ ...s, eff: effectiveStatus(s, now) }));
  const paid = eff.filter((s) => s.eff === "ACTIVE" && s.provider === "mercadopago");
  const manual = eff.filter((s) => s.eff === "ACTIVE" && s.provider !== "mercadopago").length;
  const mrr = paid.reduce((sum, s) => sum + priceFor(s.plan === "ELITE" ? "ELITE" : "PRO"), 0);
  const trialsStarted30 = eff.filter((s) => s.trialStartedAt && s.trialStartedAt >= d30).length;
  const converted30 = paid.filter((s) => s.trialStartedAt && s.trialStartedAt >= d30).length;
  const env = getEnv();
  const legal = legalStatus();
  const mpAccount = isBillingConfigured() ? await verifyBillingAccount() : null;
  return {
    generatedAt: now.getTime(),
    users: { total: users, signups7d: signups7, signups30d: signups30 },
    subscriptions: {
      trialing: eff.filter((s) => s.eff === "TRIALING").length,
      expired: eff.filter((s) => s.eff === "EXPIRED").length,
      activePaid: paid.length,
      activeManual: manual,
      pro: paid.filter((s) => s.plan !== "ELITE").length,
      elite: paid.filter((s) => s.plan === "ELITE").length,
      pastDue: eff.filter((s) => s.eff === "PAST_DUE").length,
      cancelled: eff.filter((s) => s.eff === "CANCELLED").length,
      mrrBrl: mrr,
      trialToPaid30d: trialsStarted30 ? converted30 / trialsStarted30 : null,
      trialsStarted30d: trialsStarted30,
    },
    usage: { activeMonitors: monitors, strategies, openTickets },
    funnel30d: Object.fromEntries(events30.map((e) => [e.name, e._count._all])),
    recentBilling: billing,
    recentUsers: recentUsers.map((u) => ({ email: u.email, createdAt: u.createdAt, role: u.role, status: u.subscription?.status ?? "—", plan: u.subscription?.plan ?? "—" })),
    readiness: [
      {
        key: "billing",
        label: mpAccount?.ok
          ? `Mercado Pago: token ${mpAccount.tokenKind === "production" ? "de produção" : mpAccount.tokenKind} válido · titular ${mpAccount.name ?? mpAccount.nickname ?? "?"}${mpAccount.docType ? ` (${mpAccount.docType} final ${mpAccount.docLast2 ?? "?"})` : ""}${mpAccount.testUser ? " · CONTA DE TESTE" : ""}`
          : `Mercado Pago: MERCADOPAGO_ACCESS_TOKEN ${mpAccount ? `recusado — ${mpAccount.error}` : "ausente"}`,
        ok: Boolean(mpAccount?.ok && mpAccount.tokenKind === "production" && !mpAccount.testUser),
      },
      { key: "webhook", label: "Mercado Pago: MERCADOPAGO_WEBHOOK_SECRET", ok: Boolean(env.MERCADOPAGO_WEBHOOK_SECRET) },
      { key: "legal_entity", label: `Fornecedor identificado (${legal.missing.length ? `faltam ${legal.missing.join(", ")}` : "completo"})`, ok: legal.missing.length === 0 },
      { key: "legal_approved", label: `Termos/Privacidade/Reembolso aprovados (LEGAL_TERMS_APPROVED, versão ${legal.version})`, ok: legal.approved },
      { key: "registration", label: `Cadastro aberto (REGISTRATION_MODE=${env.REGISTRATION_MODE}${env.REGISTRATION_MODE === "open" && legal.missing.length ? " — aguardando fornecedor identificado" : ""})`, ok: isRegistrationOpen() },
      { key: "email", label: "E-mail transacional (RESEND_API_KEY + EMAIL_FROM)", ok: isEmailConfigured() },
      { key: "push", label: "Push (VAPID)", ok: await isPushConfigured() },
      { key: "app_url", label: `URL pública (NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL})`, ok: env.NEXT_PUBLIC_APP_URL.startsWith("https://") },
      { key: "self_plan", label: "Troca de plano sem pagamento desligada (ALLOW_SELF_PLAN_CHANGE=false)", ok: !env.ALLOW_SELF_PLAN_CHANGE },
    ],
    checkoutEnabled: isBillingConfigured() && legal.ready,
  };
}
