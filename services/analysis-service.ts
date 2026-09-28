import { orchestrate, type OrchestratorResult } from "@/agents/orchestrator";
import { createDefaultTools } from "@/agents/tools";
import type { AgentRunResult } from "@/agents/types";
import { getPrisma } from "@/database/client";
import { getCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import type { Timeframe } from "@/types/market";

const log = createLogger("analysis-service");

export interface AnalyzeOptions {
  symbol: string;
  timeframe: Timeframe;
  includeSentiment?: boolean;
  useLlm?: boolean;
  refresh?: boolean;
  trigger?: "api" | "worker" | "agent";
  userId?: string | null;
  agentId?: string | null;
}

const TTL_SECONDS = 120;

/**
 * Executa o orquestrador para um ativo/timeframe com cache curto e persistência
 * (AgentExecution + AgentResult) quando há banco.
 */
export async function analyzeAsset(options: AnalyzeOptions): Promise<OrchestratorResult & { cached: boolean }> {
  const cache = getCache();
  const key = `analysis:${options.symbol}:${options.timeframe}:${options.includeSentiment !== false ? "s" : "ns"}:${options.useLlm !== false ? "llm" : "nollm"}`;
  if (!options.refresh) {
    const hit = await cache.get<OrchestratorResult>(key);
    if (hit) return { ...hit, cached: true };
  }

  const prisma = getPrisma();
  const execution = prisma
    ? await prisma.agentExecution
        .create({
          data: {
            symbol: options.symbol,
            timeframe: options.timeframe,
            trigger: options.trigger ?? "api",
            status: "running",
            userId: options.userId ?? null,
            agentId: options.agentId ?? null,
          },
        })
        .catch((err) => {
          log.warn("não foi possível registrar execução", { error: (err as Error).message });
          return null;
        })
    : null;

  const results: AgentRunResult<unknown>[] = [];
  const result = await orchestrate(
    { symbol: options.symbol, timeframe: options.timeframe, includeSentiment: options.includeSentiment ?? true, useLlm: options.useLlm ?? true },
    {
      tools: createDefaultTools(),
      executionId: execution?.id,
      onAgentResult: (r) => {
        results.push(r);
      },
    },
  );

  if (prisma && execution) {
    const failed = results.some((r) => r.status === "error");
    const partial = results.some((r) => r.status === "fallback");
    await prisma
      .$transaction([
        prisma.agentResult.createMany({
          data: results.map((r) => ({
            executionId: execution.id,
            agentName: r.agent,
            status: r.status,
            output: JSON.parse(JSON.stringify(r.output ?? null, jsonSafe)),
            logs: JSON.parse(JSON.stringify(r.logs, jsonSafe)),
            durationMs: r.durationMs,
          })),
        }),
        prisma.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: failed ? (result.outputs.market ? "partial" : "failed") : partial ? "partial" : "succeeded",
            finishedAt: new Date(),
            durationMs: result.durationMs,
          },
        }),
      ])
      .catch((err) => log.warn("persistência da análise falhou", { error: (err as Error).message }));
  }

  await cache.set(key, result, TTL_SECONDS);
  return { ...result, cached: false };
}

/** JSON não representa NaN/Infinity; convertemos para null para persistir. */
export function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "number" && !Number.isFinite(value) ? null : value;
}
