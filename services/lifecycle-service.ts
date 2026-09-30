import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { acquireCronLock } from "@/lib/cron";
import { createLogger } from "@/lib/logger";
import { effectiveStatus } from "@/lib/entitlements";
import { formatNoticeTime, sendTemplate, type TemplateKind } from "@/services/email-service";
import { sendPushToUser } from "@/services/push-service";
import { purgeAccessLogs } from "@/services/access-log-service";

const log = createLogger("lifecycle");

/**
 * Janelas dos avisos do teste, em horas antes do fim (teste de 3 dias):
 * - `trial_ending` na véspera: entre 24 h e 6 h antes do fim;
 * - `trial_last_day` nas últimas 6 h (também sai sozinho se a conta não recebeu o da véspera).
 */
export const TRIAL_NOTICE_WINDOW_HOURS = { ending: 24, lastDay: 6 } as const;

type NoticeKind = Extract<TemplateKind, "trial_ending" | "trial_last_day" | "trial_ended">;

export interface NoticeSubscription {
  plan: string;
  status: string;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  providerSubscriptionId: string | null;
  lastNoticeKind: string | null;
}

/** Qual aviso do teste a conta deve receber agora (no máximo um de cada tipo; null = nenhum). */
export function trialNoticeKind(s: NoticeSubscription, now: Date): NoticeKind | null {
  const eff = effectiveStatus(s, now);
  if (eff === "TRIALING" && s.trialEndsAt) {
    const hours = (s.trialEndsAt.getTime() - now.getTime()) / 3600_000;
    if (hours <= 0 || hours > TRIAL_NOTICE_WINDOW_HOURS.ending) return null;
    if (hours <= TRIAL_NOTICE_WINDOW_HOURS.lastDay) return s.lastNoticeKind === "trial_last_day" || s.lastNoticeKind === "trial_ended" ? null : "trial_last_day";
    return s.lastNoticeKind ? null : "trial_ending";
  }
  if (eff === "EXPIRED" && s.trialStartedAt && !s.providerSubscriptionId && s.lastNoticeKind !== "trial_ended") return "trial_ended";
  return null;
}

/**
 * Filtro do lote. `lastNoticeKind: { not: "trial_ended" }` sozinho exclui linhas com NULL no SQL (NULL <> 'x' é NULL),
 * por isso o OR explícito com `null`. Três grupos, cada um sai do lote depois de tratado (sem ocupar o `take` para sempre):
 * 1. teste terminando ou terminado sem o aviso final;
 * 2. status EXPIRED de teste sem o aviso final;
 * 3. conta sem acesso com monitor ainda ativo (pausa).
 */
export function lifecycleWhere(now: Date): Prisma.SubscriptionWhereInput {
  const notEnded: Prisma.SubscriptionWhereInput["OR"] = [{ lastNoticeKind: null }, { lastNoticeKind: { not: "trial_ended" } }];
  const soon = new Date(now.getTime() + TRIAL_NOTICE_WINDOW_HOURS.ending * 3600_000);
  return {
    OR: [
      { status: "TRIALING", trialEndsAt: { lte: soon }, OR: notEnded },
      { status: "EXPIRED", trialStartedAt: { not: null }, providerSubscriptionId: null, OR: notEnded },
      {
        user: { monitors: { some: { active: true } } },
        OR: [{ status: "EXPIRED" }, { status: "TRIALING", trialEndsAt: { lt: now } }, { status: "CANCELLED", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lt: now } }] }],
      },
    ],
  };
}

/** Título e texto do push de cada aviso (cada um diferente). */
export function noticePush(kind: NoticeKind, trialEndsAt: Date | null): { title: string; body: string } {
  if (kind === "trial_ending") return { title: trialEndsAt ? `Seu teste termina em ${formatNoticeTime(trialEndsAt)}` : "Seu teste termina em breve", body: "Escolha um plano para manter agentes e alertas funcionando. Seus dados ficam salvos." };
  if (kind === "trial_last_day") return { title: "Últimas horas do teste", body: "Assine em Planos. Na primeira contratação, você tem 7 dias para desistir com reembolso integral." };
  return { title: "Seu teste terminou", body: "Seus dados continuam salvos. Escolha um plano para voltar de onde parou." };
}

/**
 * Ciclo de vida da assinatura (roda no máximo 1×/hora dentro do ciclo do cron):
 *  - avisos do teste: véspera, últimas horas, encerrado (e-mail + push; um aviso de cada tipo por conta)
 *  - teste/assinatura encerrados: monitores pausados (dados preservados)
 *  - registros de acesso com mais de 190 dias removidos
 */
export async function runLifecycle(now = new Date()): Promise<Record<string, number> | { skipped: true }> {
  const prisma = getPrisma();
  if (!prisma) return { skipped: true };
  // trava atômica (INCR com TTL) que não é liberada no fim: garante no máximo uma execução por hora
  if (!(await acquireCronLock("lifecycle", 3600))) return { skipped: true };

  const out = { trialEnding: 0, trialLastDay: 0, trialEnded: 0, monitorsPaused: 0, accessLogsPurged: 0 };
  const subs = await prisma.subscription.findMany({
    where: lifecycleWhere(now),
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
    orderBy: { trialEndsAt: "asc" },
    take: 500,
  });
  for (const s of subs) {
    if (s.user.role === "ADMIN") continue;
    const eff = effectiveStatus(s, now);
    const kind = trialNoticeKind(s, now);
    if (eff === "EXPIRED") {
      const r = await prisma.monitor.updateMany({ where: { userId: s.userId, active: true }, data: { active: false, lastError: "pausado: assinatura inativa" } });
      out.monitorsPaused += r.count;
    }
    if (!kind) continue;
    await sendTemplate(kind, { to: s.user.email, name: s.user.name, endsAt: s.trialEndsAt ?? undefined }).catch(() => undefined);
    await sendPushToUser(s.userId, { ...noticePush(kind, s.trialEndsAt), url: "/planos", tag: kind }).catch(() => undefined);
    await prisma.subscription.update({ where: { id: s.id }, data: { lastNoticeKind: kind, lastNoticeAt: now } });
    if (kind === "trial_ending") out.trialEnding++;
    else if (kind === "trial_last_day") out.trialLastDay++;
    else out.trialEnded++;
  }
  out.accessLogsPurged = await purgeAccessLogs();
  log.info("ciclo de vida", out);
  return out;
}
