import { connection } from "next/server";
import type { Prisma } from "@prisma/client";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, withApi } from "@/lib/api";
import { runSimulation, simulationInputSchema } from "@/services/simulation-service";
import { requireCoreUser } from "@/services/subscription-service";

/** Simulações salvas do usuário. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const items = await requirePrisma().simulation.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return ok({ items });
});

/** Executa e salva uma simulação (limite de 100 por usuário). */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const body = await parseBody(req, simulationInputSchema);
  const prisma = requirePrisma();
  const count = await prisma.simulation.count({ where: { userId: user.id } });
  if (count >= 100) throw new ApiError(400, "Limite de 100 simulações salvas", "limit");
  const result = await runSimulation(body);
  const { curve, ...summary } = result;
  const saved = await prisma.simulation.create({
    data: {
      userId: user.id,
      symbol: body.symbol,
      strategy: body.strategy,
      currency: body.currency,
      initialCapital: body.initialCapital,
      monthlyContribution: body.monthlyContribution,
      months: body.months,
      riskProfile: body.riskProfile,
      totalInvested: result.totalInvested,
      finalValue: result.finalValue,
      profitPct: result.profitPct,
      maxDrawdownPct: result.maxDrawdownPct,
      result: { ...summary, curve: curve.filter((_, i) => i % 2 === 0) } as unknown as Prisma.InputJsonValue,
    },
  });
  return ok({ simulation: saved, result }, { status: 201 });
});
