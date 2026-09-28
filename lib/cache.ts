import type Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("cache");

/**
 * Cache de aplicação com dois backends:
 *  - Redis (REDIS_URL definido e alcançável): compartilhado entre web e worker.
 *  - Memória (fallback): por processo, com expiração por TTL.
 * A interface é a mesma; a troca é transparente para os consumidores.
 */
export interface CacheBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  /** Incremento atômico com TTL definido na criação da chave; devolve o valor após incrementar. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  kind(): "redis" | "memory";
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

class MemoryCache implements CacheBackend {
  private store = new Map<string, MemoryEntry>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor() {
    // Varredura periódica para não acumular chaves expiradas.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    // Não manter o processo vivo apenas por causa do timer.
    if (typeof this.sweeper.unref === "function") this.sweeper.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.store) if (e.expiresAt <= now) this.store.delete(k);
  }

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const e = this.store.get(key);
    const now = Date.now();
    if (!e || e.expiresAt <= now) {
      this.store.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = (typeof e.value === "number" ? e.value : 0) + 1;
    e.value = next;
    return next;
  }

  async keys(prefix: string): Promise<string[]> {
    const now = Date.now();
    return [...this.store.entries()].filter(([k, e]) => k.startsWith(prefix) && e.expiresAt > now).map(([k]) => k);
  }

  kind() {
    return "memory" as const;
  }

  clear() {
    this.store.clear();
  }
}

class RedisCache implements CacheBackend {
  constructor(private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", Math.max(1, Math.ceil(ttlSeconds)));
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const next = await this.client.incr(key);
    if (next === 1) await this.client.expire(key, Math.max(1, Math.ceil(ttlSeconds)));
    return next;
  }

  async keys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      out.push(...batch);
    } while (cursor !== "0");
    return out;
  }

  kind() {
    return "redis" as const;
  }
}

/**
 * Backend resiliente: tenta Redis; em qualquer falha usa memória e re-tenta o Redis
 * depois de um intervalo, sem derrubar a requisição.
 */
class ResilientCache implements CacheBackend {
  private memory = new MemoryCache();
  private redis: RedisCache | null = null;
  private redisDownUntil = 0;
  private connecting: Promise<void> | null = null;

  private async ensureRedis(): Promise<RedisCache | null> {
    const url = getEnv().REDIS_URL;
    if (!url) return null;
    if (this.redis) return this.redis;
    if (Date.now() < this.redisDownUntil) return null;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { default: IORedis } = await import("ioredis");
          const client = new IORedis(url, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            connectTimeout: 2000,
            enableOfflineQueue: false,
            retryStrategy: () => null,
          });
          client.on("error", (err: Error) => {
            log.warn("redis error; usando memória", { error: err.message });
            this.redis = null;
            this.redisDownUntil = Date.now() + 30_000;
            client.disconnect();
          });
          await client.connect();
          this.redis = new RedisCache(client);
          log.info("redis conectado");
        } catch (err) {
          log.warn("redis indisponível; usando cache em memória", { error: (err as Error).message });
          this.redis = null;
          this.redisDownUntil = Date.now() + 30_000;
        } finally {
          this.connecting = null;
        }
      })();
    }
    await this.connecting;
    return this.redis;
  }

  private async withBackend<T>(fn: (b: CacheBackend) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    const r = await this.ensureRedis();
    if (r) {
      try {
        return await fn(r);
      } catch (err) {
        log.warn("falha no redis; caindo para memória", { error: (err as Error).message });
        this.redis = null;
        this.redisDownUntil = Date.now() + 30_000;
      }
    }
    return fallback();
  }

  get<T>(key: string) {
    return this.withBackend(
      (b) => b.get<T>(key),
      () => this.memory.get<T>(key),
    );
  }

  set<T>(key: string, value: T, ttlSeconds: number) {
    // Escreve nos dois: se o Redis cair, a memória ainda tem a última coleta.
    return this.withBackend(
      async (b) => {
        await b.set(key, value, ttlSeconds);
        await this.memory.set(key, value, ttlSeconds);
      },
      () => this.memory.set(key, value, ttlSeconds),
    );
  }

  del(key: string) {
    return this.withBackend(
      async (b) => {
        await b.del(key);
        await this.memory.del(key);
      },
      () => this.memory.del(key),
    );
  }

  keys(prefix: string) {
    return this.withBackend(
      (b) => b.keys(prefix),
      () => this.memory.keys(prefix),
    );
  }

  incr(key: string, ttlSeconds: number) {
    return this.withBackend(
      (b) => b.incr(key, ttlSeconds),
      () => this.memory.incr(key, ttlSeconds),
    );
  }

  kind() {
    return this.redis ? ("redis" as const) : ("memory" as const);
  }

  /** Apenas para testes. */
  _clearMemory() {
    this.memory.clear();
  }
}

declare global {
  var __cryptoscannerCache: ResilientCache | undefined;
}

export function getCache(): ResilientCache {
  if (!globalThis.__cryptoscannerCache) globalThis.__cryptoscannerCache = new ResilientCache();
  return globalThis.__cryptoscannerCache;
}

/**
 * Padrão "cache-aside" com valor obsoleto (stale) retornado quando a origem falha.
 * Retorna { value, stale } para a interface indicar "usando última coleta disponível".
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, options: { staleTtlSeconds?: number } = {}): Promise<{ value: T; stale: boolean; fromCache: boolean }> {
  const cache = getCache();
  const fresh = await cache.get<T>(key);
  if (fresh !== null) return { value: fresh, stale: false, fromCache: true };

  const staleKey = `${key}:stale`;
  try {
    const value = await loader();
    await cache.set(key, value, ttlSeconds);
    await cache.set(staleKey, value, options.staleTtlSeconds ?? Math.max(ttlSeconds * 20, 3600));
    return { value, stale: false, fromCache: false };
  } catch (err) {
    const stale = await cache.get<T>(staleKey);
    if (stale !== null) {
      log.warn("origem falhou; retornando valor obsoleto", { key, error: (err as Error).message });
      return { value: stale, stale: true, fromCache: true };
    }
    throw err;
  }
}
