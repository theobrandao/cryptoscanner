/** Cliente HTTP para as rotas /api (uso em componentes cliente). */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export const NETWORK_MESSAGE = "Sem conexão. Verifique a internet e tente de novo.";
export const UNAVAILABLE_MESSAGE = "Serviço temporariamente indisponível. Tente em instantes.";
export const GENERIC_MESSAGE = "Não foi possível concluir agora. Tente de novo.";

/** Segundos de espera informados pelo servidor (cabeçalho Retry-After ou detalhe do erro). */
function retryAfterSeconds(res: Response, details: unknown): number | null {
  const h = Number(res.headers.get("retry-after"));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const d = details as { retryAfter?: unknown; resetAt?: unknown } | undefined;
  if (typeof d?.retryAfter === "number" && d.retryAfter > 0) return Math.ceil(d.retryAfter);
  if (typeof d?.resetAt === "number") return Math.max(1, Math.ceil((d.resetAt - Date.now()) / 1000));
  return null;
}

export function rateLimitMessage(seconds: number | null): string {
  return seconds ? `Muitas tentativas. Aguarde ${seconds} s.` : "Muitas tentativas. Aguarde alguns instantes.";
}

/**
 * Chamada às rotas /api com mensagens em português para falhas fora do envelope da API:
 * sem rede, 5xx sem JSON (plataforma/proxy) e 429 (usa Retry-After). Cancelamento (AbortError) é repassado.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
      credentials: "same-origin",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError(0, "network_error", NETWORK_MESSAGE);
  }
  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || !json.ok) {
    const err = json?.error;
    if (res.status === 429) throw new ApiClientError(429, err?.code ?? "rate_limited", err?.code === "ai_quota" && err.message ? err.message : rateLimitMessage(retryAfterSeconds(res, err?.details)), err?.details);
    if (!err) throw new ApiClientError(res.status, "http_error", res.status >= 500 ? UNAVAILABLE_MESSAGE : GENERIC_MESSAGE);
    throw new ApiClientError(res.status, err.code ?? "http_error", err.message ?? (res.status >= 500 ? UNAVAILABLE_MESSAGE : GENERIC_MESSAGE), err.details);
  }
  return json.data as T;
}

/** Texto para mostrar ao usuário a partir de qualquer erro (nunca "Failed to fetch" nem texto técnico). */
export function errorMessage(err: unknown, fallback = GENERIC_MESSAGE): string {
  if (err instanceof ApiClientError) return err.message || fallback;
  if (err instanceof DOMException && err.name === "AbortError") return "Cancelado.";
  if (err instanceof TypeError) return NETWORK_MESSAGE;
  return fallback;
}

export const swrFetcher = <T>(url: string) => apiFetch<T>(url);

export function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST"): Promise<T> {
  return apiFetch<T>(url, { method, body: JSON.stringify(body) });
}
