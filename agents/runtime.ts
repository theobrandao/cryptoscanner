import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import {
  AgentInputError,
  AgentOutputError,
  AgentTimeoutError,
  ToolNotAllowedError,
  type AgentContext,
  type AgentDefinition,
  type AgentLogEntry,
  type AgentLogLevel,
  type AgentRunResult,
  type ToolRegistry,
} from "@/agents/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("agents");

/**
 * Registro global de ferramentas disponíveis aos agentes. Cada agente só enxerga as
 * ferramentas listadas em `allowedTools`; o registro é a única porta para efeitos colaterais.
 */
export type ToolMap = Record<string, unknown>;

export function createToolRegistry(agentName: string, allowed: readonly string[], tools: ToolMap): ToolRegistry {
  const allowedSet = new Set(allowed);
  return {
    use<T>(name: string): T {
      if (!allowedSet.has(name)) throw new ToolNotAllowedError(agentName, name);
      const t = tools[name];
      if (t === undefined) throw new Error(`[${agentName}] ferramenta não registrada: ${name}`);
      return t as T;
    },
    has(name: string) {
      return allowedSet.has(name) && tools[name] !== undefined;
    },
  };
}

export function defineAgent<I, O>(def: AgentDefinition<I, O>): AgentDefinition<I, O> {
  return def;
}

function validate<T>(schema: ZodType<T>, value: unknown, onError: (detail: string) => Error): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "<raiz>"}: ${i.message}`)
      .join("; ");
    throw onError(detail);
  }
  return parsed.data;
}

export interface RunOptions {
  tools: ToolMap;
  executionId?: string;
  now?: number;
  /** signal externo (ex.: cancelamento do orquestrador) */
  signal?: AbortSignal;
}

/**
 * Executa um agente com: validação de entrada, timeout, validação de saída, fallback e logs.
 * Nunca lança: falhas viram `status: "error"` com a mensagem e os logs coletados.
 */
export async function runAgent<I, O>(def: AgentDefinition<I, O>, rawInput: unknown, options: RunOptions): Promise<AgentRunResult<O>> {
  const startedAt = Date.now();
  const logs: AgentLogEntry[] = [];
  const executionId = options.executionId ?? randomUUID();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const ctx: AgentContext = {
    executionId,
    now: options.now ?? startedAt,
    signal: controller.signal,
    tools: createToolRegistry(def.name, def.allowedTools, options.tools),
    log(level: AgentLogLevel, message: string, data?: Record<string, unknown>) {
      logs.push({ ts: Date.now(), level, message, data });
      log.child(def.name)[level](message, { executionId, ...(data ?? {}) });
    },
  };

  const finish = (status: AgentRunResult<O>["status"], output: O | null, error?: string): AgentRunResult<O> => {
    const finishedAt = Date.now();
    options.signal?.removeEventListener("abort", onAbort);
    return { agent: def.name, status, output, error, logs, startedAt, finishedAt, durationMs: finishedAt - startedAt };
  };

  let input: I;
  try {
    input = validate(def.inputSchema, rawInput, (d) => new AgentInputError(def.name, d));
  } catch (err) {
    ctx.log("error", (err as Error).message);
    return finish("error", null, (err as Error).message);
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AgentTimeoutError(def.name, def.timeoutMs));
    }, def.timeoutMs);
  });

  try {
    const raw = await Promise.race([def.run(input, ctx), timeout]);
    const output = validate(def.outputSchema, raw, (d) => new AgentOutputError(def.name, d));
    return finish("ok", output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.log("error", message);
    if (def.fallback) {
      try {
        const fb = await def.fallback(input, ctx, err);
        if (fb !== null) {
          const output = validate(def.outputSchema, fb, (d) => new AgentOutputError(def.name, `fallback: ${d}`));
          ctx.log("warn", "resultado de fallback utilizado");
          return finish("fallback", output, message);
        }
      } catch (fbErr) {
        ctx.log("error", `fallback falhou: ${(fbErr as Error).message}`);
      }
    }
    return finish("error", null, message);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
