import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, withApi } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { PLANS, planAllowsTimeframe } from "@/lib/plans";
import {
  SENTINEL_STRATEGIES,
  sentinelBodySchema,
} from "@/lib/validation/sentinel";
import { requireCoreUser } from "@/services/subscription-service";

/** Sentinelas do usuário (agentes do tipo sentinel) com o último relatório de cada um. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const prisma = requirePrisma();
  const items = await prisma.agent.findMany({
    where: { userId: user.id, kind: "sentinel" },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { logs: true } },
      logs: {
        where: { level: "signal" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  return ok({ items, limit: PLANS[user.plan].maxSentinels });
});

/** Cria um Sentinela (um por moeda). Slots separados dos agentes comuns. */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const body = await parseBody(req, sentinelBodySchema);
  const plan = PLANS[user.plan];
  if (!planAllowsTimeframe(user.plan, body.timeframe))
    throw new ApiError(
      403,
      `Timeframe ${body.timeframe.toUpperCase()} disponível apenas no plano ELITE`,
      "plan_required",
    );
  if (body.notification !== "log" && !plan.telegramAlerts)
    throw new ApiError(
      403,
      "Alertas no Telegram exigem plano PRO ou ELITE",
      "plan_required",
    );
  const asset = ASSETS.find((a) => a.symbol === body.symbol);
  if (!asset)
    throw new ApiError(404, "Ativo não encontrado", "asset_not_found");
  const prisma = requirePrisma();
  const existing = await prisma.agent.findFirst({
    where: {
      userId: user.id,
      kind: "sentinel",
      symbols: { has: body.symbol },
      status: { in: ["ACTIVE", "PAUSED"] },
    },
  });
  if (existing)
    throw new ApiError(
      409,
      `Já existe um Sentinela para ${body.symbol}`,
      "duplicate",
    );
  const active = await prisma.agent.count({
    where: {
      userId: user.id,
      kind: "sentinel",
      status: { in: ["ACTIVE", "PAUSED"] },
    },
  });
  if (active >= plan.maxSentinels)
    throw new ApiError(
      403,
      `Seu plano permite até ${plan.maxSentinels} Sentinela(s) simultâneo(s)`,
      "sentinel_limit",
    );
  const agent = await prisma.agent.create({
    data: {
      userId: user.id,
      kind: "sentinel",
      name: `Sentinela ${body.symbol}`,
      icon: "🛰️",
      description: `Vigia multipadrão de ${asset.name} em ${body.timeframe.toUpperCase()} (17 padrões + confluência técnica)`,
      symbols: [body.symbol],
      operationType: body.timeframe === "4h" ? "day_trade" : "swing_trade",
      timeframe: body.timeframe,
      strategies: [...SENTINEL_STRATEGIES],
      minConfidence: body.minConfidence,
      notification: body.notification,
    },
  });
  return ok({ sentinel: agent }, { status: 201 });
});
