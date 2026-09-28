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

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || !json.ok) {
    const err = json?.error;
    throw new ApiClientError(res.status, err?.code ?? "http_error", err?.message ?? `Erro HTTP ${res.status}`, err?.details);
  }
  return json.data as T;
}

export const swrFetcher = <T>(url: string) => apiFetch<T>(url);

export function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST"): Promise<T> {
  return apiFetch<T>(url, { method, body: JSON.stringify(body) });
}
