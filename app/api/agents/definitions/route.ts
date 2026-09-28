import { AGENT_DEFINITIONS, ORCHESTRATOR_DEFINITION } from "@/agents/orchestrator";
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
  const { pipeline, ...orchestrator } = ORCHESTRATOR_DEFINITION;
  return ok({
    agents: [...defs, { ...orchestrator, inputs: [...orchestrator.inputs], outputs: [...orchestrator.outputs], allowedTools: [...orchestrator.allowedTools], rules: [...orchestrator.rules] }],
    orchestrator: { name: ORCHESTRATOR_DEFINITION.name, pipeline: [...pipeline], purpose: ORCHESTRATOR_DEFINITION.purpose },
    llm: getLlmInfo(),
  });
});
