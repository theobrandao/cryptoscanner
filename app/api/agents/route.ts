import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, parseQuery, requireUser, withApi } from "@/lib/api";
import { PLANS, planAllowsTimeframe } from "@/lib/plans";
import { agentBodySchema } from "@/lib/validation/agent";

export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const q = parseQuery(req, z.object({ status: z.enum(["ALL", "ACTIVE", "PAUSED", "STOPPED"]).default("ALL") }));
  const prisma = requirePrisma();
  const items = await prisma.agent.findMany({
    where: { userId: user.id, ...(q.status === "ALL" ? {} : { status: q.status }) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { logs: true } }, logs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const counts = await prisma.agent.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } });
  return ok({ items, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), limit: PLANS[user.plan].maxAgents });
});

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, agentBodySchema);
  const plan = PLANS[user.plan];
  if (!planAllowsTimeframe(user.plan, body.timeframe)) throw new ApiError(403, `Timeframe ${body.timeframe.toUpperCase()} disponível apenas no plano PLATINUM`, "plan_required");
  if (body.notification !== "log" && !plan.telegramAlerts) throw new ApiError(403, "Alertas no Telegram exigem plano PRO ou PLATINUM", "plan_required");
  const prisma = requirePrisma();
  const active = await prisma.agent.count({ where: { userId: user.id, status: { in: ["ACTIVE", "PAUSED"] } } });
  if (active >= plan.maxAgents) throw new ApiError(403, `Seu plano permite até ${plan.maxAgents} agentes simultâneos`, "agent_limit");
  const agent = await prisma.agent.create({ data: { userId: user.id, ...body, description: body.description ?? null } });
  return ok({ agent }, { status: 201 });
});

/** "Excluir Todos" — irreversível. */
export const DELETE = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const { count } = await requirePrisma().agent.deleteMany({ where: { userId: user.id } });
  return ok({ deleted: count });
});
