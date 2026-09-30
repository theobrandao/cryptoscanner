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
  /** Grava só se a chave não existir (SET NX PX); devolve true quando gravou. Base das travas curtas. */
  setNX(key: string, value: unknown, ttlMs: number): Promise<boolean>;
  kind(): "redis" | "memory";
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

/** Teto de chaves no cache em memória (LRU): o fallback por processo não cresce sem limite. */
export const MEMORY_MAX_ENTRIES = 2000;

class MemoryCache implements CacheBackend {
  private store = new Map<string, MemoryEntry>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly maxEntries = MEMORY_MAX_ENTRIES) {
    // Varredura periódica para não acumular chaves expiradas.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    // Não manter o processo vivo apenas por causa do timer.
    if (typeof this.sweeper.unref === "function") this.sweeper.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.store) if (e.expiresAt <= now) this.store.delete(k);
  }

  /** Map preserva a ordem de inserção: reinserir marca como usado; o primeiro é o menos usado. */
  private put(key: string, entry: MemoryEntry) {
    this.store.delete(key);
    this.store.set(key, entry);
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, e);
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.put(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async setNX(key: string, value: unknown, ttlMs: number): Promise<boolean> {
    const e = this.store.get(key);
    if (e && e.expiresAt > Date.now()) return false;
    this.put(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  }

  size() {
    return this.store.size;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const e = this.store.get(key);
    const now = Date.now();
    if (!e || e.expiresAt <= now) {
      this.put(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
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

  async setNX(key: string, value: unknown, ttlMs: number): Promise<boolean> {
    return (await this.client.set(key, JSON.stringify(value), "PX", Math.max(1, Math.ceil(ttlMs)), "NX")) === "OK";
  }

  disconnect() {
    this.client.disconnect();
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
            // comando sem resposta não segura a requisição: falha em 1,5 s e o cache cai para memória
            commandTimeout: 1500,
            enableOfflineQueue: false,
            retryStrategy: () => null,
          });
          client.on("error", (err: Error) => {
            log.warn("redis error; usando memória", { error: err.message });
            this.redis = null;
            this.redisDownUntil = Date.now() + 30_000;
            client.disconnect();
          });
          await client.connect().catch((err: Error) => {
            client.disconnect();
            throw err;
          });
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
        // descarta a conexão (timeout/erro): sem disconnect o socket e os timers ficariam abertos
        if (this.redis === r) {
          this.redis = null;
          this.redisDownUntil = Date.now() + 30_000;
          r.disconnect();
        }
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

  setNX(key: string, value: unknown, ttlMs: number) {
    return this.withBackend(
      (b) => b.setNX(key, value, ttlMs),
      () => this.memory.setNX(key, value, ttlMs),
    );
  }

  kind() {
    return this.redis ? ("redis" as const) : ("memory" as const);
  }

  /** Apenas para testes. */
  _clearMemory() {
    this.memory.clear();
    inflight.clear();
  }

  /** Apenas para testes: chaves no fallback em memória. */
  _memorySize() {
    return this.memory.size();
  }
}

declare global {
  var __cryptoscannerCache: ResilientCache | undefined;
}

export function getCache(): ResilientCache {
  if (!globalThis.__cryptoscannerCache) globalThis.__cryptoscannerCache = new ResilientCache();
  return globalThis.__cryptoscannerCache;
}

/** Chamadas em andamento por chave (single-flight no processo): N requisições simultâneas disparam um único loader. */
const inflight = new Map<string, Promise<unknown>>();

function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Mantém viva a atualização em segundo plano depois da resposta (Vercel); fora de uma requisição Next só segue. */
function keepAlive(p: Promise<unknown>) {
  void import("next/server")
    .then(({ after }) => after(() => p))
    .catch(() => undefined);
}

/** Valor obsoleto guardado com a hora da coleta (permite servir "stale-while-revalidate" só dentro de uma janela). */
interface StaleEnvelope<T> {
  __sv: 1;
  v: T;
  at: number;
}

function unwrapStale<T>(raw: unknown): { value: T; at: number } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && (raw as StaleEnvelope<T>).__sv === 1) return { value: (raw as StaleEnvelope<T>).v, at: (raw as StaleEnvelope<T>).at };
  return { value: raw as T, at: 0 }; // formato anterior (valor puro): idade desconhecida
}

export interface CachedOptions {
  /** quanto tempo o último valor fica guardado como reserva para falha da origem */
  staleTtlSeconds?: number;
  /** janela (s) em que o valor vencido é devolvido na hora enquanto outro cálculo o atualiza em segundo plano */
  swrSeconds?: number;
  /** trava distribuída (SET key:lock NX PX 15000): só uma instância recalcula um loader caro */
  lock?: boolean;
  /** ignora o valor fresco e recalcula (o valor obsoleto continua cobrindo falha) */
  force?: boolean;
  /** cache curto de erro (s): origem fora do ar não é chamada de novo a cada requisição. 0 desliga. */
  negativeTtlSeconds?: number;
}

export const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 10_000;
const LOCK_POLL_MS = 250;
export const NEGATIVE_TTL_SECONDS = 8;

/** Grava o valor como se o loader tivesse rodado (fresco + reserva). Usado para aquecer uma chave irmã. */
export async function primeCached<T>(key: string, value: T, ttlSeconds: number, options: Pick<CachedOptions, "staleTtlSeconds"> = {}): Promise<void> {
  const cache = getCache();
  await cache.set(key, value, ttlSeconds);
  await cache.set(`${key}:stale`, { __sv: 1, v: value, at: Date.now() } satisfies StaleEnvelope<T>, options.staleTtlSeconds ?? Math.max(ttlSeconds * 20, 3600));
  await cache.del(`${key}:err`).catch(() => undefined);
}

async function load<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, options: CachedOptions, stale: { value: T; at: number } | null): Promise<{ value: T; fromCache: boolean; stale: boolean }> {
  const cache = getCache();
  let locked = false;
  if (options.lock) {
    locked = await cache.setNX(`${key}:lock`, 1, LOCK_TTL_MS).catch(() => true);
    if (!locked) {
      // outra instância está calculando: reserva na hora, senão espera o valor aparecer (até 10 s) e só então calcula
      if (stale) return { value: stale.value, fromCache: true, stale: true };
      const until = Date.now() + LOCK_WAIT_MS;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
        const hit = await cache.get<T>(key);
        if (hit !== null) return { value: hit, fromCache: true, stale: false };
      }
    }
  }
  try {
    const value = await loader();
    await primeCached(key, value, ttlSeconds, options);
    return { value, fromCache: false, stale: false };
  } catch (err) {
    const neg = options.negativeTtlSeconds ?? NEGATIVE_TTL_SECONDS;
    if (neg > 0) await cache.set(`${key}:err`, { message: (err as Error).message }, neg).catch(() => undefined);
    throw err;
  } finally {
    if (locked) await cache.del(`${key}:lock`).catch(() => undefined);
  }
}

/**
 * Padrão "cache-aside" com valor obsoleto (stale) retornado quando a origem falha.
 * Retorna { value, stale } para a interface indicar "usando última coleta disponível".
 * Proteções: single-flight por chave no processo, trava distribuída opcional (`lock`), cache curto de erro
 * e, com `swrSeconds`, devolve o valor recém-vencido na hora enquanto atualiza em segundo plano.
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, options: CachedOptions = {}): Promise<{ value: T; stale: boolean; fromCache: boolean }> {
  const cache = getCache();
  if (!options.force) {
    const fresh = await cache.get<T>(key);
    if (fresh !== null) return { value: fresh, stale: false, fromCache: true };
  }

  const staleKey = `${key}:stale`;
  const readStale = async () => unwrapStale<T>(await cache.get<unknown>(staleKey).catch(() => null));

  if (!options.force) {
    // erro recente da origem: não chama de novo dentro da janela curta
    const neg = await cache.get<{ message: string }>(`${key}:err`).catch(() => null);
    if (neg) {
      const s = await readStale();
      if (s) return { value: s.value, stale: true, fromCache: true };
      throw new Error(neg.message);
    }
    if (options.swrSeconds) {
      const s = await readStale();
      if (s && s.at > 0 && Date.now() - s.at <= options.swrSeconds * 1000) {
        const refresh = singleFlight(key, () => load(key, ttlSeconds, loader, options, s)).catch((err) => log.warn("atualização em segundo plano falhou", { key, error: (err as Error).message }));
        keepAlive(refresh);
        return { value: s.value, stale: false, fromCache: true };
      }
    }
  }

  const reserve = options.lock ? await readStale() : null;
  try {
    return await singleFlight(key, () => load(key, ttlSeconds, loader, options, reserve));
  } catch (err) {
    const s = reserve ?? (await readStale());
    if (s !== null) {
      log.warn("origem falhou; retornando valor obsoleto", { key, error: (err as Error).message });
      return { value: s.value, stale: true, fromCache: true };
    }
    throw err;
  }
}
