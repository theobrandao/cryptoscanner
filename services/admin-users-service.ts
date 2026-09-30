import type { Prisma } from "@prisma/client";
import { requirePrisma } from "@/database/client";
import { ApiError } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/env";
import type { Tier } from "@/lib/entitlements";
import { actionBlockedReason, classifyUser, extendedTrialEnd, grantPeriodEnd, matchesFilter, STATUS_LABEL_ADMIN, TIER_LABEL_ADMIN, toCsv, validityLabel, type AdminAction, type AdminSort, type AdminStatus } from "@/lib/admin-users";
import { logAccess } from "@/services/access-log-service";
import { sendPasswordResetLink } from "@/services/password-reset-service";

/**
 * Painel de controle — gestão de usuários pelo dono (somente ADMIN; a rota confere o papel).
 * Toda ação grava AdminAuditLog. Contas de administrador/dono não recebem ações.
 */

export interface ListParams {
  q?: string;
  tier?: Tier;
  status?: AdminStatus;
  sort?: AdminSort;
  page?: number;
  pageSize?: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  lastAccessAt: Date | null;
  loginMethod: "google" | "senha";
  role: "USER" | "ADMIN";
  isOwner: boolean;
  tier: Tier;
  status: AdminStatus;
  subscription: { plan: string; status: string; provider: string | null; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null;
  blockedAt: Date | null;
  blockedReason: string | null;
  counts: { agents: number; monitors: number; alerts: number; strategies: number };
  telegramConnected: boolean;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  googleSub: true,
  role: true,
  blockedAt: true,
  blockedReason: true,
  telegramChatId: true,
  subscription: { select: { plan: true, status: true, provider: true, trialEndsAt: true, currentPeriodEnd: true, updatedAt: true } },
  _count: { select: { agents: true, monitors: true, alerts: true, strategies: true } },
} satisfies Prisma.UserSelect;

type UserPick = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toRow(u: UserPick, lastAccessAt: Date | null, now: Date): AdminUserRow {
  const { tier, status, effective } = classifyUser(u, now);
  const s = u.subscription;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    lastAccessAt,
    loginMethod: u.googleSub ? "google" : "senha",
    role: u.role,
    isOwner: isOwnerEmail(u.email),
    tier,
    status,
    subscription: s ? { plan: s.plan, status: effective ?? s.status, provider: s.provider, trialEndsAt: s.trialEndsAt, currentPeriodEnd: s.currentPeriodEnd } : null,
    blockedAt: u.blockedAt,
    blockedReason: u.blockedReason,
    counts: { agents: u._count.agents, monitors: u._count.monitors, alerts: u._count.alerts, strategies: u._count.strategies },
    telegramConnected: Boolean(u.telegramChatId),
  };
}

/** Último login/cadastro por usuário (AccessLog guarda 190 dias). */
async function lastAccessMap(userIds: string[]): Promise<Map<string, Date>> {
  if (!userIds.length) return new Map();
  const prisma = requirePrisma();
  const rows = await prisma.accessLog.groupBy({ by: ["userId"], where: { userId: { in: userIds }, event: { in: ["login", "register"] } }, _max: { createdAt: true } });
  return new Map(rows.filter((r) => r.userId && r._max.createdAt).map((r) => [r.userId as string, r._max.createdAt as Date]));
}

/** Lista filtrada/ordenada (sem paginação) + totais por acesso para os filtros. */
async function filteredRows(params: ListParams) {
  const prisma = requirePrisma();
  const q = params.q?.trim();
  const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {};
  const users = await prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: "desc" } });
  const last = await lastAccessMap(users.map((u) => u.id));
  const now = new Date();
  const all = users.map((u) => toRow(u, last.get(u.id) ?? null, now));
  const totals = { all: all.length, TRIAL: 0, PRO: 0, ELITE: 0, NONE: 0, ADMIN: 0, blocked: 0 };
  for (const r of all) {
    totals[r.tier] += 1;
    if (r.blockedAt) totals.blocked += 1;
  }
  const rows = all.filter((r) => matchesFilter(r, { tier: params.tier, status: params.status }));
  const sort = params.sort ?? "recentes";
  if (sort === "nome") rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  else if (sort === "ultimo_acesso") rows.sort((a, b) => (b.lastAccessAt?.getTime() ?? -Infinity) - (a.lastAccessAt?.getTime() ?? -Infinity) || b.createdAt.getTime() - a.createdAt.getTime());
  return { rows, totals };
}

export async function listUsers(params: ListParams) {
  const pageSize = params.pageSize ?? 25;
  const { rows, totals } = await filteredRows(params);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, params.page ?? 1), pages);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, pages, totals };
}

const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "");

/** CSV da lista filtrada (todas as páginas). */
export async function exportUsersCsv(params: ListParams): Promise<string> {
  const { rows } = await filteredRows(params);
  const header = ["Nome", "E-mail", "Cadastro", "Último acesso", "Acesso", "Plano", "Situação", "Validade", "Método de login", "Agentes", "Monitores", "Alertas", "Bloqueado"];
  return toCsv(
    header,
    rows.map((r) => [r.name, r.email, fmtDate(r.createdAt), fmtDate(r.lastAccessAt), TIER_LABEL_ADMIN[r.tier], r.subscription?.plan ?? "", STATUS_LABEL_ADMIN[r.status], validityLabel(r.tier, r.subscription), r.loginMethod === "google" ? "Google" : "E-mail e senha", r.counts.agents, r.counts.monitors, r.counts.alerts, r.blockedAt ? `sim (${fmtDate(r.blockedAt)})` : "não"]),
  );
}

export async function getUserDetail(id: string) {
  const prisma = requirePrisma();
  const u = await prisma.user.findUnique({ where: { id }, select: { ...userSelect, preference: { select: { theme: true, currency: true, defaultTimeframe: true, language: true, learning: true } }, termsVersion: true, termsAcceptedAt: true, onboardedAt: true, passwordChangedAt: true } });
  if (!u) throw new ApiError(404, "Usuário não encontrado", "not_found");
  const [last, accessLogs, grants, audit, events] = await Promise.all([
    lastAccessMap([u.id]),
    prisma.accessLog.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 20, select: { ip: true, event: true, createdAt: true } }),
    prisma.externalGrant.findMany({ where: { email: u.email }, orderBy: { updatedAt: "desc" }, select: { provider: true, externalId: true, plan: true, status: true, currentPeriodEnd: true, lastEvent: true, lastOrderId: true, appliedAt: true, createdAt: true, updatedAt: true } }),
    prisma.adminAuditLog.findMany({ where: { targetUserId: u.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.analyticsEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 10, select: { name: true, createdAt: true } }),
  ]);
  const learning = u.preference?.learning && typeof u.preference.learning === "object" ? Object.values(u.preference.learning as Record<string, { done?: boolean }>).filter((v) => v?.done).length : 0;
  return {
    user: toRow(u, last.get(u.id) ?? null, new Date()),
    termsVersion: u.termsVersion,
    termsAcceptedAt: u.termsAcceptedAt,
    onboardedAt: u.onboardedAt,
    passwordChangedAt: u.passwordChangedAt,
    preference: u.preference ? { theme: u.preference.theme, currency: u.preference.currency, defaultTimeframe: u.preference.defaultTimeframe, language: u.preference.language, lessonsDone: learning } : null,
    accessLogs,
    grants,
    audit,
    events,
  };
}

// ------------------------------------------------------------------
// Ações
// ------------------------------------------------------------------

type Actor = Pick<SessionUser, "id" | "email">;

async function loadTarget(actor: Actor, id: string, action: AdminAction) {
  const prisma = requirePrisma();
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, blockedAt: true, subscription: true } });
  if (!target) throw new ApiError(404, "Usuário não encontrado", "not_found");
  const reason = actionBlockedReason(action, { id: target.id, role: target.role, isOwner: isOwnerEmail(target.email) }, actor.id);
  if (reason) throw new ApiError(403, reason, "forbidden_target");
  return target;
}

function audit(tx: Prisma.TransactionClient, actor: Actor, target: { id: string; email: string }, action: string, details?: Prisma.InputJsonValue) {
  return tx.adminAuditLog.create({ data: { adminId: actor.id, adminEmail: actor.email, targetUserId: target.id, targetEmail: target.email, action, details } });
}

/**
 * Pausa as automações da conta (agentes ativos → PAUSED, alertas e monitores ativos → inativos) na mesma transação do
 * bloqueio/encerramento, para não seguir enviando avisos. Desbloquear/liberar acesso não retoma: o usuário reativa.
 */
async function pauseAutomations(tx: Prisma.TransactionClient, userId: string, why: string) {
  const agents = await tx.agent.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "PAUSED" } });
  const alerts = await tx.alert.updateMany({ where: { userId, active: true }, data: { active: false } });
  const monitors = await tx.monitor.updateMany({ where: { userId, active: true }, data: { active: false, lastError: `pausado: ${why}` } });
  return { agents: agents.count, alerts: alerts.count, monitors: monitors.count };
}

/** Registro: automações pausadas não voltam sozinhas ao desbloquear/liberar acesso. */
const MANUAL_RESUME = { automations: "manual_resume" } as const;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const subSnapshot = (s: { plan: string; status: string; provider: string | null; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null) => (s ? { plan: s.plan, status: s.status, provider: s.provider, trialEndsAt: iso(s.trialEndsAt), currentPeriodEnd: iso(s.currentPeriodEnd) } : null);

/** Libera PRO/ELITE por `days` dias (somados ao período ativo que ainda resta) ou sem prazo (null). */
export async function grantAccess(actor: Actor, userId: string, plan: "PRO" | "ELITE", days: number | null) {
  const target = await loadTarget(actor, userId, "grant");
  const prisma = requirePrisma();
  const now = new Date();
  const before = target.subscription;
  const currentPeriodEnd = grantPeriodEnd(days, before, now);
  await prisma.$transaction(async (tx) => {
    // providerSubscriptionId fica intacto (o vínculo com a Kiwify/Mercado Pago não é apagado)
    await tx.subscription.upsert({
      where: { userId },
      create: { userId, plan, status: "ACTIVE", provider: "manual", currentPeriodEnd, cancelAtPeriodEnd: false },
      update: { plan, status: "ACTIVE", provider: "manual", currentPeriodEnd, cancelAtPeriodEnd: false },
    });
    await tx.user.update({ where: { id: userId }, data: { plan: plan === "ELITE" ? "PLATINUM" : "PRO" } });
    await audit(tx, actor, target, "grant", { plan, days, currentPeriodEnd: iso(currentPeriodEnd), before: subSnapshot(before), ...MANUAL_RESUME });
  });
}

/** Estende (ou reabre) o teste grátis do PRO em `days` dias. Conta com plano pago ativo usa "Liberar acesso". */
export async function extendTrial(actor: Actor, userId: string, days: number) {
  const target = await loadTarget(actor, userId, "extend_trial");
  const { tier } = classifyUser({ role: target.role, blockedAt: null, subscription: target.subscription });
  if (tier === "PRO" || tier === "ELITE") throw new ApiError(409, "Este usuário já tem plano ativo. Use Liberar acesso para mudar o prazo.", "has_active_plan");
  const prisma = requirePrisma();
  const now = new Date();
  const before = target.subscription;
  const trialEndsAt = extendedTrialEnd(days, before?.status === "TRIALING" ? before.trialEndsAt : null, now);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { userId },
      create: { userId, plan: "PRO", status: "TRIALING", trialStartedAt: now, trialEndsAt },
      update: { plan: "PRO", status: "TRIALING", trialEndsAt, trialStartedAt: before?.trialStartedAt ?? now, lastNoticeKind: null, lastNoticeAt: null },
    });
    await tx.user.update({ where: { id: userId }, data: { plan: "PRO" } });
    await audit(tx, actor, target, "extend_trial", { days, trialEndsAt: iso(trialEndsAt), before: subSnapshot(before) });
  });
}

/** Encerra o acesso agora (EXPIRED). O vínculo com o provedor de pagamento não é alterado. */
export async function revokeAccess(actor: Actor, userId: string) {
  const target = await loadTarget(actor, userId, "revoke");
  const prisma = requirePrisma();
  const now = new Date();
  const before = target.subscription;
  await prisma.$transaction(async (tx) => {
    if (before) await tx.subscription.update({ where: { userId }, data: { status: "EXPIRED", currentPeriodEnd: now, cancelAtPeriodEnd: false } });
    else await tx.subscription.create({ data: { userId, plan: "PRO", status: "EXPIRED", currentPeriodEnd: now } });
    await tx.user.update({ where: { id: userId }, data: { plan: "FREE" } });
    const paused = await pauseAutomations(tx, userId, "acesso encerrado");
    await audit(tx, actor, target, "revoke", { before: subSnapshot(before), paused });
  });
}

/** Bloqueia a conta: não entra mais, as sessões abertas caem na hora e as automações são pausadas. */
export async function blockUser(actor: Actor, userId: string, reason: string) {
  const target = await loadTarget(actor, userId, "block");
  const prisma = requirePrisma();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { blockedAt: now, blockedReason: reason || null, passwordChangedAt: now } });
    const paused = await pauseAutomations(tx, userId, "conta bloqueada");
    await audit(tx, actor, target, "block", { reason: reason || null, paused });
  });
}

export async function unblockUser(actor: Actor, userId: string) {
  const target = await loadTarget(actor, userId, "unblock");
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { blockedAt: null, blockedReason: null } });
    await audit(tx, actor, target, "unblock", { wasBlockedAt: iso(target.blockedAt), ...MANUAL_RESUME });
  });
}

/** Encerra todas as sessões abertas (o usuário precisa entrar de novo). */
export async function endSessions(actor: Actor, userId: string) {
  const target = await loadTarget(actor, userId, "end_sessions");
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date() } });
    await audit(tx, actor, target, "end_sessions");
  });
}

/** Envia o link de redefinição de senha para o e-mail do usuário. */
export async function sendPasswordReset(actor: Actor, userId: string) {
  const target = await loadTarget(actor, userId, "password_reset");
  if (target.blockedAt) throw new ApiError(409, "Conta bloqueada. Desbloqueie antes de enviar o link.", "account_blocked");
  const r = await sendPasswordResetLink(target);
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    await audit(tx, actor, target, "password_reset", { emailEnabled: r.emailEnabled });
  });
  return r;
}

/**
 * Exclui a conta (mesma cascata da exclusão feita pelo próprio usuário: preferências, watchlist, agentes, monitores,
 * alertas, histórico). Compras na Kiwify (por e-mail) e o registro de ações ficam.
 */
export async function deleteUser(actor: Actor, userId: string, confirmEmail: string, req: Request) {
  const target = await loadTarget(actor, userId, "delete");
  if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) throw new ApiError(400, "O e-mail digitado não confere com o da conta.", "confirm_mismatch");
  const prisma = requirePrisma();
  await logAccess(req, target.id, "account_deleted");
  await prisma.$transaction(async (tx) => {
    await audit(tx, actor, target, "delete", { name: target.name, subscription: subSnapshot(target.subscription) });
    await tx.user.delete({ where: { id: userId } });
  });
}

export async function listAudit(page = 1, pageSize = 30) {
  const prisma = requirePrisma();
  const total = await prisma.adminAuditLog.count();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const rows = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (p - 1) * pageSize, take: pageSize });
  return { rows, total, page: p, pages, pageSize };
}
