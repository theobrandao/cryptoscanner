import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, ok, parseBody, parseQuery, withApi } from "@/lib/api";
import { PLANS } from "@/lib/plans";
import { agentBodySchema } from "@/lib/validation/agent";
import { requireCoreUser, requireTimeframe } from "@/services/subscription-service";

/** Janela da contagem de registros exibida na lista. */
const LOG_COUNT_WINDOW_MS = 7 * 86_400_000;

export const GET = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const q = parseQuery(
    req,
    z.object({
      status: z.enum(["ALL", "ACTIVE", "PAUSED", "STOPPED"]).default("ALL"),
    }),
  );
  const prisma = requirePrisma();
  const items = await prisma.agent.findMany({
    where: {
      userId: user.id,
      kind: "agent",
      ...(q.status === "ALL" ? {} : { status: q.status }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      // só os últimos 7 dias (usa o índice agentId+createdAt; o histórico inteiro não é varrido a cada abertura)
      _count: { select: { logs: { where: { createdAt: { gte: new Date(Date.now() - LOG_COUNT_WINDOW_MS) } } } } },
      logs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const counts = await prisma.agent.groupBy({
    by: ["status"],
    where: { userId: user.id, kind: "agent" },
    _count: { _all: true },
  });
  return ok({
    items,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    limit: PLANS[user.plan].maxAgents,
  });
});

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  await enforceRateLimit(req, "agent_create", `u:${user.id}`);
  const body = await parseBody(req, agentBodySchema);
  const plan = PLANS[user.plan];
  requireTimeframe(user.access, body.timeframe, "agents");
  if (body.notification !== "log" && !plan.telegramAlerts)
    throw new ApiError(
      403,
      "Alertas no Telegram exigem plano PRO ou ELITE",
      "plan_required",
    );
  const prisma = requirePrisma();
  const active = await prisma.agent.count({
    where: {
      userId: user.id,
      kind: "agent",
      status: { in: ["ACTIVE", "PAUSED"] },
    },
  });
  if (active >= plan.maxAgents)
    throw new ApiError(
      403,
      `Seu plano permite até ${plan.maxAgents} agentes simultâneos`,
      "agent_limit",
    );
  const agent = await prisma.agent.create({
    data: { userId: user.id, ...body, description: body.description ?? null },
  });
  return ok({ agent }, { status: 201 });
});

/** "Excluir Todos" — irreversível. */
export const DELETE = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const { count } = await requirePrisma().agent.deleteMany({
    where: { userId: user.id, kind: "agent" },
  });
  return ok({ deleted: count });
});
