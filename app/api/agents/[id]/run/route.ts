import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, ok, withApi } from "@/lib/api";
import { runUserAgent } from "@/services/user-agent-service";
import { requireCoreUser } from "@/services/subscription-service";

/** Executa o agente imediatamente (sem esperar o ciclo do worker). */
export const POST = withApi(async (req, ctx) => {
  await connection();
  const user = await requireCoreUser(req);
  await enforceRateLimit(req, "auth", `agent-run:${user.id}`);
  const { id } = await ctx.params;
  const agent = await requirePrisma().agent.findFirst({ where: { id: id ?? "", userId: user.id } });
  if (!agent) throw new ApiError(404, "Agente não encontrado", "not_found");
  const summary = await runUserAgent(agent, { force: true });
  return ok(summary);
});
