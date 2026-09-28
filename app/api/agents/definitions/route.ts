import { AGENT_DEFINITIONS } from "@/agents/orchestrator";
import { scannerAgent } from "@/agents/scanner-agent";
import { ok, withApi } from "@/lib/api";
import { getLlmInfo } from "@/services/llm";

/** Documentação viva dos agentes do sistema (propósito, inputs, outputs, ferramentas, regras, timeout). */
export const GET = withApi(async () => {
  const defs = [scannerAgent, ...AGENT_DEFINITIONS].map((d) => ({
    name: d.name,
    purpose: d.purpose,
    inputs: d.inputs,
    outputs: d.outputs,
    allowedTools: d.allowedTools,
    rules: d.rules,
    timeoutMs: d.timeoutMs,
    hasFallback: typeof d.fallback === "function",
  }));
  return ok({
    agents: defs,
    orchestrator: {
      name: "orchestrator",
      pipeline: ["market-agent", "technical-analysis-agent", "trend-agent", "risk-agent", "sentiment-agent"],
      purpose: "Consolidar evidências, detectar conflitos e dados ausentes, calcular métricas derivadas.",
    },
    llm: getLlmInfo(),
  });
});
