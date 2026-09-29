import { getPrisma } from "@/database/client";
import { getCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { effectiveStatus } from "@/lib/entitlements";
import { sendTemplate, type TemplateKind } from "@/services/email-service";
import { sendPushToUser } from "@/services/push-service";
import { purgeAccessLogs } from "@/services/access-log-service";

const log = createLogger("lifecycle");

/**
 * Ciclo de vida da assinatura (roda no máximo 1×/hora dentro do ciclo do cron):
 *  - avisos do teste: faltam 2 dias, último dia, encerrado (e-mail + push; um aviso de cada tipo por conta)
 *  - teste/assinatura encerrados: monitores pausados (dados preservados)
 *  - registros de acesso com mais de 190 dias removidos
 */
export async function runLifecycle(now = new Date()): Promise<Record<string, number> | { skipped: true }> {
  const prisma = getPrisma();
  if (!prisma) return { skipped: true };
  const cache = getCache();
  if (await cache.get("lifecycle:lock")) return { skipped: true };
  await cache.set("lifecycle:lock", "1", 3600);

  const out = { trialEnding: 0, trialLastDay: 0, trialEnded: 0, monitorsPaused: 0, accessLogsPurged: 0 };
  const soon = new Date(now.getTime() + 48 * 3600_000);
  const subs = await prisma.subscription.findMany({
    where: { OR: [{ status: "TRIALING", trialEndsAt: { lte: soon } }, { status: { in: ["EXPIRED", "CANCELLED", "PAST_DUE"] }, lastNoticeKind: { not: "trial_ended" } }] },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
    take: 500,
  });
  for (const s of subs) {
    if (s.user.role === "ADMIN") continue;
    const eff = effectiveStatus(s, now);
    let kind: TemplateKind | null = null;
    if (eff === "TRIALING" && s.trialEndsAt) {
      const hours = (s.trialEndsAt.getTime() - now.getTime()) / 3600_000;
      if (hours <= 24 && s.lastNoticeKind !== "trial_last_day") kind = "trial_last_day";
      else if (hours > 24 && hours <= 48 && !s.lastNoticeKind) kind = "trial_ending";
    } else if (eff === "EXPIRED" && s.trialStartedAt && !s.providerSubscriptionId && s.lastNoticeKind !== "trial_ended") {
      kind = "trial_ended";
    }
    if (eff === "EXPIRED") {
      const r = await prisma.monitor.updateMany({ where: { userId: s.userId, active: true }, data: { active: false, lastError: "pausado: assinatura inativa" } });
      out.monitorsPaused += r.count;
    }
    if (!kind) continue;
    await sendTemplate(kind, { to: s.user.email, name: s.user.name, daysLeft: 2 }).catch(() => undefined);
    const title = kind === "trial_ending" ? "Seu teste termina em 2 dias" : kind === "trial_last_day" ? "Último dia do teste" : "Seu teste terminou";
    await sendPushToUser(s.userId, { title, body: "Escolha PRO ou ELITE para manter o acesso. Seus dados continuam salvos.", url: "/planos", tag: kind }).catch(() => undefined);
    await prisma.subscription.update({ where: { id: s.id }, data: { lastNoticeKind: kind, lastNoticeAt: now } });
    if (kind === "trial_ending") out.trialEnding++;
    else if (kind === "trial_last_day") out.trialLastDay++;
    else out.trialEnded++;
  }
  out.accessLogsPurged = await purgeAccessLogs();
  log.info("ciclo de vida", out);
  return out;
}
