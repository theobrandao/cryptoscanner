import type Redis from "ioredis";
import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("rate-limit");

/**
 * Contadores de controle (limite de taxa e cota da IA). Ficam separados do cache de leitura (`lib/cache.ts`):
 * o cache pode cair para a memória do processo sem prejuízo, mas um contador de controle em memória na Vercel
 * vira "por instância" e deixa de limitar. Por isso:
 *  - com Redis: INCR + PEXPIRE atômicos (script Lua) e o TTL real da janela;
 *  - fora de produção sem Redis: memória do processo (desenvolvimento e testes);
 *  - em produção sem Redis: `getControlStore()` devolve null e cada chamador decide (login/cadastro respondem 503,
 *    a cota da IA vai para o Postgres, os demais limites seguem em memória com log de erro).
 */
export interface ControlStore {
  kind: "redis" | "memory";
  /** Incrementa e devolve o valor e o tempo restante da janela (ms). A janela começa no primeiro incremento. */
  incr(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  /** Desfaz um incremento (estorno); nunca fica negativo. */
  decr(key: string): Promise<void>;
  get(key: string): Promise<number>;
}

class MemoryControlStore implements ControlStore {
  readonly kind = "memory" as const;
  private store = new Map<string, { count: number; expiresAt: number }>();

  private live(key: string, now: number) {
    const e = this.store.get(key);
    if (e && e.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  async incr(key: string, windowMs: number) {
    const now = Date.now();
    // teto simples para não crescer sem limite num processo longo
    if (this.store.size > 50_000) for (const [k, e] of this.store) if (e.expiresAt <= now) this.store.delete(k);
    const e = this.live(key, now);
    if (!e) {
      this.store.set(key, { count: 1, expiresAt: now + windowMs });
      return { count: 1, ttlMs: windowMs };
    }
    e.count += 1;
    return { count: e.count, ttlMs: Math.max(0, e.expiresAt - now) };
  }

  async decr(key: string) {
    const e = this.live(key, Date.now());
    if (e && e.count > 0) e.count -= 1;
  }

  async get(key: string) {
    return this.live(key, Date.now())?.count ?? 0;
  }

  clear() {
    this.store.clear();
  }
}

const INCR_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
local t = redis.call('PTTL', KEYS[1])
if n == 1 or t < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  t = tonumber(ARGV[1])
end
return {n, t}
`;
const DECR_SCRIPT = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n > 0 then redis.call('DECR', KEYS[1]) end
return 0
`;

class RedisControlStore implements ControlStore {
  readonly kind = "redis" as const;
  constructor(private readonly client: Redis) {}

  async incr(key: string, windowMs: number) {
    const [count, ttl] = (await this.client.eval(INCR_SCRIPT, 1, key, String(Math.max(1, Math.round(windowMs))))) as [number, number];
    return { count: Number(count), ttlMs: Math.max(0, Number(ttl)) };
  }

  async decr(key: string) {
    await this.client.eval(DECR_SCRIPT, 1, key);
  }

  async get(key: string) {
    const raw = await this.client.get(key);
    return raw ? Number(raw) || 0 : 0;
  }
}

interface ControlState {
  redis: RedisControlStore | null;
  downUntil: number;
  connecting: Promise<void> | null;
  memory: MemoryControlStore;
  override: ControlStore | null | undefined;
}

declare global {
  var __cryptoscannerControl: ControlState | undefined;
}

function state(): ControlState {
  if (!globalThis.__cryptoscannerControl) globalThis.__cryptoscannerControl = { redis: null, downUntil: 0, connecting: null, memory: new MemoryControlStore(), override: undefined };
  return globalThis.__cryptoscannerControl;
}

function markDown(s: ControlState, reason: string) {
  log.error("redis indisponível para contadores de controle", { error: reason });
  s.redis = null;
  s.downUntil = Date.now() + 15_000;
}

async function connectRedis(s: ControlState, url: string): Promise<RedisControlStore | null> {
  if (s.redis) return s.redis;
  if (Date.now() < s.downUntil) return null;
  if (!s.connecting) {
    s.connecting = (async () => {
      try {
        const { default: IORedis } = await import("ioredis");
        const client = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 1500, enableOfflineQueue: false, retryStrategy: () => null });
        client.on("error", (err: Error) => {
          markDown(s, err.message);
          client.disconnect();
        });
        await client.connect();
        s.redis = new RedisControlStore(client);
      } catch (err) {
        markDown(s, (err as Error).message);
      } finally {
        s.connecting = null;
      }
    })();
  }
  await s.connecting;
  return s.redis;
}

/**
 * Store de contadores de controle. Null = sem armazenamento compartilhado em produção (Redis ausente ou fora do ar):
 * o chamador decide entre recusar (503) ou usar outro armazenamento.
 */
export async function getControlStore(): Promise<ControlStore | null> {
  const s = state();
  if (s.override !== undefined) return s.override;
  const env = getEnv();
  if (env.REDIS_URL) {
    const r = await connectRedis(s, env.REDIS_URL);
    if (r) return r;
  }
  return env.NODE_ENV === "production" ? null : s.memory;
}

/** Executa uma operação no store; falha do Redis no meio da operação conta como indisponível. */
export async function withControlStore<T>(fn: (store: ControlStore) => Promise<T>): Promise<{ ok: true; value: T; store: ControlStore } | { ok: false }> {
  const store = await getControlStore();
  if (!store) return { ok: false };
  try {
    return { ok: true, value: await fn(store), store };
  } catch (err) {
    if (store.kind === "redis") markDown(state(), (err as Error).message);
    return { ok: false };
  }
}

/** Apenas para testes: fixa o store (null simula produção sem Redis); `undefined` volta ao normal e limpa a memória. */
export function _setControlStoreForTests(store: ControlStore | null | undefined): void {
  const s = state();
  s.override = store;
  s.memory.clear();
}

/** Store em memória isolado (testes). */
export function createMemoryControlStore(): ControlStore & { clear(): void } {
  return new MemoryControlStore();
}

// ------------------------------------------------------------------ limite de taxa

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** epoch ms em que a janela reabre (TTL real da chave) */
  resetAt: number;
  /** segundos até a janela reabrir (≥ 1), para o cabeçalho Retry-After */
  retryAfterSeconds: number;
  /** false quando não havia armazenamento compartilhado e o fluxo é estrito (o chamador deve responder 503) */
  available: boolean;
}

/**
 * Janela fixa iniciada no primeiro acesso. `strict`: sem Redis em produção, responde `available:false`
 * em vez de contar na memória da instância (usado por login e cadastro).
 */
export async function rateLimit(bucket: string, key: string, limit: number, opts: { windowSeconds?: number; strict?: boolean } = {}): Promise<RateLimitResult> {
  const windowMs = (opts.windowSeconds ?? 60) * 1000;
  const cacheKey = `ratelimit:${bucket}:${key}`;
  let res = await withControlStore((s) => s.incr(cacheKey, windowMs));
  if (!res.ok) {
    if (opts.strict) {
      log.error("limite de taxa sem armazenamento compartilhado; fluxo recusado", { bucket });
      return { allowed: false, remaining: 0, limit, resetAt: Date.now() + 5_000, retryAfterSeconds: 5, available: false };
    }
    log.error("limite de taxa contado só nesta instância (sem Redis)", { bucket });
    res = { ok: true, value: await state().memory.incr(cacheKey, windowMs), store: state().memory };
  }
  const { count, ttlMs } = res.value;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    limit,
    resetAt: Date.now() + ttlMs,
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    available: true,
  };
}

/** Fluxos com balde próprio. `auth` é o balde legado (checkout, teste de push, exclusão de conta, execução de agente, suporte). */
export type RateLimitFlow =
  | "public"
  | "llm"
  | "auth"
  | "login_ip"
  | "login_email"
  | "register"
  | "password_forgot"
  | "password_forgot_email"
  | "password_reset"
  | "google"
  | "google_callback"
  | "support"
  | "telegram_test"
  | "agent_create"
  | "alert_create"
  | "admin_export"
  | "stream_tickers"
  | "scanner_refresh";

export interface FlowConfig {
  limit: number;
  windowSeconds: number;
  /** sem Redis em produção: recusa com 503 em vez de contar só na instância */
  strict?: boolean;
}

export function flowConfig(flow: RateLimitFlow): FlowConfig {
  const env = getEnv();
  const auth = env.RATE_LIMIT_AUTH_PER_MINUTE;
  switch (flow) {
    case "public":
      return { limit: env.RATE_LIMIT_PUBLIC_PER_MINUTE, windowSeconds: 60 };
    case "llm":
      return { limit: env.RATE_LIMIT_LLM_PER_MINUTE, windowSeconds: 60 };
    case "auth":
      return { limit: auth, windowSeconds: 60 };
    case "login_ip":
      return { limit: auth, windowSeconds: 60, strict: true };
    case "login_email":
      return { limit: 10, windowSeconds: 15 * 60, strict: true };
    case "register":
      return { limit: auth, windowSeconds: 60, strict: true };
    case "password_forgot":
      return { limit: auth, windowSeconds: 60 };
    case "password_forgot_email":
      return { limit: 5, windowSeconds: 60 * 60 };
    case "password_reset":
      return { limit: auth, windowSeconds: 60 };
    case "google":
      return { limit: auth, windowSeconds: 60 };
    case "google_callback":
      return { limit: 20, windowSeconds: 60 };
    case "support":
      return { limit: 5, windowSeconds: 10 * 60 };
    case "telegram_test":
      return { limit: 5, windowSeconds: 10 * 60 };
    case "agent_create":
      return { limit: 20, windowSeconds: 60 };
    case "alert_create":
      return { limit: 30, windowSeconds: 60 };
    case "admin_export":
      return { limit: 5, windowSeconds: 60 };
    case "stream_tickers":
      // cada aba reabre a conexão a cada ~50 s; 60/min por IP cobre várias abas e redes compartilhadas
      return { limit: 60, windowSeconds: 60 };
    case "scanner_refresh":
      return { limit: 6, windowSeconds: 60 };
  }
}

/** Hash curto do e-mail normalizado: a chave do limite não guarda o e-mail em claro. */
export function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Cabeçalhos padrão de limite de taxa. */
export function rateLimitHeaders(r: Pick<RateLimitResult, "limit" | "remaining" | "resetAt" | "retryAfterSeconds">, blocked: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
  };
  if (blocked) h["Retry-After"] = String(r.retryAfterSeconds);
  return h;
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
