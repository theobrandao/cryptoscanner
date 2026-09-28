import { getEnv } from "@/lib/env";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} em ${url}`);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  /** status HTTP que não devem ser re-tentados (ex.: 451 geo-bloqueio) */
  noRetryStatuses?: number[];
}

/**
 * fetch com timeout (AbortController), re-tentativa exponencial e parse JSON.
 * Nunca segue redirecionamentos entre hosts nem envia credenciais.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? getEnv().HTTP_TIMEOUT_MS;
  const retries = options.retries ?? 1;
  const noRetry = new Set(options.noRetryStatuses ?? [400, 401, 403, 404, 422, 451]);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: { accept: "application/json", ...(options.headers ?? {}) },
        body: options.body,
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
      });
      if (!res.ok) {
        const err = new HttpError(res.status, url);
        if (noRetry.has(res.status) || attempt === retries) throw err;
        lastError = err;
      } else {
        return (await res.json()) as T;
      }
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && noRetry.has(err.status)) throw err;
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchText(url: string, timeoutMs?: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? getEnv().HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store", redirect: "manual" });
    if (!res.ok) throw new HttpError(res.status, url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
