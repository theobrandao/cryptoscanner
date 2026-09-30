import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, withApi } from "@/lib/api";
import { agentBodySchema } from "@/lib/validation/agent";
import { requireCoreUser, requireTimeframe } from "@/services/subscription-service";

// sem os valores padrão da criação: um PATCH só de `status` não pode zerar ícone, confiança mínima e notificação
const patchSchema = agentBodySchema
  .extend({ icon: agentBodySchema.shape.icon.unwrap(), minConfidence: agentBodySchema.shape.minConfidence.unwrap(), notification: agentBodySchema.shape.notification.unwrap() })
  .partial()
  .extend({ status: z.enum(["ACTIVE", "PAUSED", "STOPPED"]).optional() });

async function own(userId: string, id: string) {
  const agent = await requirePrisma().agent.findFirst({ where: { id, userId } });
  if (!agent) throw new ApiError(404, "Agente não encontrado", "not_found");
  return agent;
}

export const GET = withApi(async (req, ctx) => {
  await connection();
  const user = await requireCoreUser(req);
  const { id } = await ctx.params;
  const agent = await own(user.id, id ?? "");
  const executions = await requirePrisma().agentExecution.findMany({ where: { agentId: agent.id }, orderBy: { startedAt: "desc" }, take: 10 });
  return ok({ agent, executions });
});

export const PATCH = withApi(async (req, ctx) => {
  await connection();
  const user = await requireCoreUser(req);
  const { id } = await ctx.params;
  const agent = await own(user.id, id ?? "");
  const body = await parseBody(req, patchSchema);
  // abaixo de 4H só no ELITE: ao trocar o timeframe e ao reativar um agente criado em plano anterior
  if ((body.timeframe && body.timeframe !== agent.timeframe) || body.status === "ACTIVE") requireTimeframe(user.access, body.timeframe ?? agent.timeframe, "agents");
  const updated = await requirePrisma().agent.update({ where: { id: agent.id }, data: { ...body, description: body.description === undefined ? undefined : body.description } });
  return ok({ agent: updated });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireCoreUser(req);
  const { id } = await ctx.params;
  const agent = await own(user.id, id ?? "");
  await requirePrisma().agent.delete({ where: { id: agent.id } });
  return ok({ deleted: true });
});
