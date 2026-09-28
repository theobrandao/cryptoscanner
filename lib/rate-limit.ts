import { getCache } from "@/lib/cache";

/**
 * Rate limiting por chave (IP ou usuário) em janela fixa de 60 s, apoiado no cache
 * (Redis quando disponível, memória caso contrário).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export async function rateLimit(bucket: string, key: string, limitPerMinute: number): Promise<RateLimitResult> {
  // Janela de 60 s iniciada no primeiro acesso (INCR atômico com TTL), sem depender do limite do minuto do relógio.
  const cache = getCache();
  const cacheKey = `ratelimit:${bucket}:${key}`;
  const next = await cache.incr(cacheKey, 60);
  return {
    allowed: next <= limitPerMinute,
    remaining: Math.max(0, limitPerMinute - next),
    limit: limitPerMinute,
    resetAt: Date.now() + 60_000,
  };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
