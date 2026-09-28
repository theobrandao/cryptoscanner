import type { ZodType } from "zod";

/**
 * Contrato comum de todos os agentes.
 * Um agente é uma função pura sobre (input validado, contexto) que devolve um output
 * validado por schema. Efeitos colaterais (rede, cache) só acontecem via `tools`.
 */

export type AgentLogLevel = "debug" | "info" | "warn" | "error";

export interface AgentLogEntry {
  ts: number;
  level: AgentLogLevel;
  message: string;
  data?: Record<string, unknown>;
}

export type AgentStatus = "ok" | "fallback" | "error" | "skipped";

export interface AgentRunResult<O> {
  agent: string;
  status: AgentStatus;
  output: O | null;
  error?: string;
  logs: AgentLogEntry[];
  startedAt: number;
  finishedAt: number;
  durationMs: number;
}

export interface ToolRegistry {
  /** Obtém uma ferramenta pelo nome; lança se o agente não tiver permissão. */
  use<T>(name: string): T;
  has(name: string): boolean;
}

export interface AgentContext {
  /** id da execução (agrupa logs de vários agentes) */
  executionId: string;
  now: number;
  signal: AbortSignal;
  tools: ToolRegistry;
  log(level: AgentLogLevel, message: string, data?: Record<string, unknown>): void;
}

export interface AgentDefinition<I, O> {
  name: string;
  purpose: string;
  /** descrição textual dos inputs/outputs para documentação e para o orquestrador */
  inputs: string[];
  outputs: string[];
  allowedTools: string[];
  rules: string[];
  timeoutMs: number;
  inputSchema: ZodType<I>;
  outputSchema: ZodType<O>;
  run(input: I, ctx: AgentContext): Promise<O>;
  /** Resultado degradado quando `run` falha ou estoura o timeout. Retornar null = sem fallback. */
  fallback?(input: I, ctx: AgentContext, error: unknown): Promise<O | null> | O | null;
}

export class AgentInputError extends Error {
  constructor(agent: string, detail: string) {
    super(`[${agent}] entrada inválida: ${detail}`);
    this.name = "AgentInputError";
  }
}

export class AgentOutputError extends Error {
  constructor(agent: string, detail: string) {
    super(`[${agent}] saída inválida: ${detail}`);
    this.name = "AgentOutputError";
  }
}

export class AgentTimeoutError extends Error {
  constructor(agent: string, timeoutMs: number) {
    super(`[${agent}] excedeu o timeout de ${timeoutMs} ms`);
    this.name = "AgentTimeoutError";
  }
}

export class ToolNotAllowedError extends Error {
  constructor(agent: string, tool: string) {
    super(`[${agent}] ferramenta não permitida: ${tool}`);
    this.name = "ToolNotAllowedError";
  }
}
