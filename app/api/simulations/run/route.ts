import { connection } from "next/server";
import { ApiError, enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { runSimulation, simulationInputSchema } from "@/services/simulation-service";

/** Executa uma simulação histórica (DCA ou aporte único) — pública (demonstração da página inicial), sem persistir. Salvar e listar exigem plano. */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const body = await parseBody(req, simulationInputSchema);
  if (body.initialCapital <= 0 && (body.strategy === "lump_sum" || body.monthlyContribution <= 0)) throw new ApiError(400, "Informe capital inicial e/ou aporte mensal maior que zero", "validation");
  const result = await runSimulation(body);
  return ok({ result });
});
