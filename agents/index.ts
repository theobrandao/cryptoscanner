/**
 * Ponto de entrada da camada de agentes.
 *
 * Pipeline:
 *   dados de mercado → scanner-agent (multi-ativo) → technical-analysis-agent → trend-agent
 *   → risk-agent → sentiment-agent → orchestrator → resultado consolidado → dashboard
 *
 * Cada agente declara propósito, inputs, outputs, ferramentas permitidas, regras, timeout,
 * fallback e schemas zod de entrada/saída (ver docs/AGENTS.md).
 */
export { marketAgent } from "@/agents/market-agent";
export { scannerAgent } from "@/agents/scanner-agent";
export { technicalAnalysisAgent } from "@/agents/technical-analysis-agent";
export { trendAgent } from "@/agents/trend-agent";
export { riskAgent } from "@/agents/risk-agent";
export { sentimentAgent } from "@/agents/sentiment-agent";
export { orchestrate, AGENT_DEFINITIONS, DISCLAIMER } from "@/agents/orchestrator";
export type { OrchestratorResult, OrchestratorInput, Evidence, Conflict } from "@/agents/orchestrator";
export { runAgent, defineAgent, createToolRegistry } from "@/agents/runtime";
export { createDefaultTools } from "@/agents/tools";
export type { AgentDefinition, AgentRunResult, AgentContext, AgentLogEntry } from "@/agents/types";
export { STRATEGIES, evaluateStrategies, listStrategies } from "@/agents/strategies";
