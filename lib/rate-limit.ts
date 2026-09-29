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

/**
 * IP do cliente para rate limit. Na Vercel, `x-vercel-forwarded-for`/`x-real-ip` são definidos pela
 * própria plataforma (o cliente não controla). Fora dela, só confia em X-Forwarded-For com TRUST_PROXY=true
 * e usa o salto mais à direita (o proxy de borda), não o primeiro, que é falsificável.
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]?.trim() || "unknown";
  if (process.env.VERCEL) return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (process.env.TRUST_PROXY === "true") {
    const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return hops[hops.length - 1] ?? req.headers.get("x-real-ip") ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
