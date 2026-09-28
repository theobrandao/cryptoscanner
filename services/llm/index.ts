import type { ZodType } from "zod";
import { getEnv, isLlmConfigured } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("llm");

/**
 * Camada de LLM opcional. Regras:
 *  - Nunca é chamada para calcular indicadores; só para interpretação textual e análise de imagem.
 *  - Toda saída passa por schema zod; texto fora do JSON é descartado.
 *  - Sem provedor configurado, as funções retornam null e o chamador segue com o caminho determinístico.
 */
export interface LlmJsonRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  /** imagem base64 (sem prefixo data:) para análise multimodal */
  image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  signal?: AbortSignal;
}

export interface LlmInfo {
  configured: boolean;
  provider: "none" | "anthropic";
  model: string;
}

export function getLlmInfo(): LlmInfo {
  const env = getEnv();
  return { configured: isLlmConfigured(), provider: isLlmConfigured() ? env.LLM_PROVIDER : "none", model: env.LLM_MODEL };
}

/** Extrai o primeiro objeto JSON de um texto (tolera cercas ```json). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("resposta sem JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function completeJson<T>(req: LlmJsonRequest<T>): Promise<T | null> {
  if (!isLlmConfigured()) return null;
  const env = getEnv();
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: env.LLM_TIMEOUT_MS });

  const content: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } }> = [];
  if (req.image) content.push({ type: "image", source: { type: "base64", media_type: req.image.mediaType, data: req.image.base64 } });
  content.push({ type: "text", text: req.user });

  const t0 = Date.now();
  const res = await client.messages.create(
    {
      model: env.LLM_MODEL,
      max_tokens: req.maxTokens ?? 1200,
      system: `${req.system}\n\nResponda SOMENTE com um objeto JSON válido, sem texto antes ou depois.`,
      messages: [{ role: "user", content }],
    },
    { signal: req.signal },
  );
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  const parsed = req.schema.safeParse(extractJson(text));
  log.info("chamada concluída", { model: env.LLM_MODEL, ms: Date.now() - t0, ok: parsed.success, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens });
  if (!parsed.success) throw new Error(`saída do LLM fora do schema: ${parsed.error.issues[0]?.message ?? ""}`);
  return parsed.data;
}
