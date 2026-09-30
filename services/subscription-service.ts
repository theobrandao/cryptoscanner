import { getPrisma } from "@/database/client";
import { ApiError, requireUser } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { ENTITLEMENTS, effectiveStatus, legacyPlanFor, tierFor, TRIAL_DAYS, type Entitlements, type SubscriptionStatus, type Tier } from "@/lib/entitlements";

export interface AccessView {
  tier: Tier;
  status: SubscriptionStatus | "NONE";
  plan: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  daysLeft: number | null;
  trialDays: number;
  /** canal da assinatura paga (mercadopago | kiwify | manual) */
  provider: string | null;
  entitlements: Entitlements;
}

/** Cria o teste grátis do PRO (TRIAL_DAYS, uma vez por conta). */
export async function startTrial(userId: string) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const now = new Date();
  return prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: "PRO", status: "TRIALING", trialStartedAt: now, trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000) },
    update: {},
  });
}

/**
 * Acesso efetivo do usuário, relido do banco (plano/papel do JWT não são confiáveis por 7 dias).
 * Contas anteriores ao modelo comercial ganham o trial na primeira leitura. Sincroniza User.plan.
 */
export async function getAccess(userId: string): Promise<AccessView> {
  const prisma = getPrisma();
  if (!prisma) return view(tierFor(null, "USER"), null);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, plan: true, subscription: true } });
  if (!user) throw new ApiError(401, "Sessão inválida", "unauthorized");
  let sub = user.subscription;
  if (!sub && user.role !== "ADMIN") sub = await startTrial(userId);
  const now = new Date();
  const tier = tierFor(sub, user.role, now);
  if (sub) {
    const eff = effectiveStatus(sub, now);
    if (eff !== sub.status) sub = await prisma.subscription.update({ where: { id: sub.id }, data: { status: eff } });
  }
  const legacy = legacyPlanFor(tier);
  if (user.plan !== legacy) await prisma.user.update({ where: { id: userId }, data: { plan: legacy } });
  return view(tier, sub);
}

function view(tier: Tier, sub: { plan: string; status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; provider?: string | null } | null): AccessView {
  const now = Date.now();
  const status = sub ? (effectiveStatus(sub) as SubscriptionStatus) : "NONE";
  return {
    tier,
    status,
    plan: tier === "ADMIN" ? "ELITE" : (sub?.plan ?? "NONE"),
    trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    daysLeft: status === "TRIALING" && sub?.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now) / 86_400_000)) : null,
    trialDays: TRIAL_DAYS,
    provider: sub?.provider ?? null,
    entitlements: ENTITLEMENTS[tier],
  };
}

/** Exige acesso ao produto (trial/PRO/ELITE/admin). `elite` exige ELITE. */
export async function requireEntitlement(user: SessionUser, need: "core" | "elite" = "core"): Promise<AccessView> {
  // sem banco (testes/ambiente local sem Postgres) só o papel assinado no token decide: ADMIN passa, o resto não
  const access = getPrisma() ? await getAccess(user.id) : view(tierFor(null, user.role), null);
  if (need === "core" && !access.entitlements.core) throw new ApiError(402, "Seu período de teste terminou. Escolha um plano para continuar.", "subscription_required");
  if (need === "elite" && !access.entitlements.elite) throw new ApiError(402, "Recurso do plano ELITE.", "elite_required");
  return access;
}

/** Usuário logado COM acesso ao produto (teste/PRO/ELITE/admin). Conta sem plano recebe 402. */
export async function requireCoreUser(req: Request, need: "core" | "elite" = "core"): Promise<SessionUser> {
  const user = await requireUser(req);
  await requireEntitlement(user, need);
  return user;
}
