import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, parseBody, requireUser, withApi } from "@/lib/api";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { salePlanForLegacyPlan } from "@/lib/access-policy";

/**
 * REIMPLEMENTAÇÃO NECESSÁRIA: a referência vende planos; este projeto não integra cobrança.
 * Com ALLOW_SELF_PLAN_CHANGE=true o usuário troca o próprio plano (ambiente de teste); caso contrário só ADMIN.
 */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ plan: z.enum(["FREE", "PRO", "PLATINUM"]) }));
  if (!getEnv().ALLOW_SELF_PLAN_CHANGE && user.role !== "ADMIN") throw new ApiError(403, "Troca de plano desabilitada (sem cobrança integrada)", "forbidden");
  const prisma = requirePrisma();
  // concessão manual (admin/ambiente de teste): reflete na assinatura, que é a fonte de verdade do acesso
  const now = new Date();
  const sub =
    body.plan === "FREE"
      ? { plan: "PRO", status: "EXPIRED", trialEndsAt: now, currentPeriodEnd: null }
      : { plan: salePlanForLegacyPlan(body.plan) ?? "PRO", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) };
  await prisma.subscription.upsert({ where: { userId: user.id }, create: { userId: user.id, provider: "manual", ...sub }, update: { provider: "manual", ...sub } });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { plan: body.plan } });
  const session = { id: updated.id, email: updated.email, name: updated.name, plan: updated.plan, role: updated.role };
  const res = NextResponse.json({ ok: true, data: { user: session } });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(session), sessionCookieOptions());
  return res;
});
