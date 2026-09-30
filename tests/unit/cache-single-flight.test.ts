import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, getCache, MEMORY_MAX_ENTRIES, primeCached } from "@/lib/cache";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("cache: single-flight, cache de erro e valor recém-vencido", () => {
  beforeEach(() => getCache()._clearMemory());
  afterEach(() => vi.useRealTimers());

  it("requisições simultâneas na mesma chave disparam um único loader", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const loader = async () => {
      calls++;
      await gate;
      return { rows: 30 };
    };
    const all = Promise.all(Array.from({ length: 8 }, () => cached("sf:scan", 60, loader)));
    await tick();
    release();
    const res = await all;
    expect(calls).toBe(1);
    expect(res.every((r) => r.value.rows === 30)).toBe(true);
    // a chamada seguinte sai do cache
    expect((await cached("sf:scan", 60, loader)).fromCache).toBe(true);
    expect(calls).toBe(1);
  });

  it("erro da origem fica em cache por alguns segundos: não chama a origem de novo e depois volta a tentar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error("origem fora do ar");
    };
    await expect(cached("neg:k", 30, failing, { negativeTtlSeconds: 8 })).rejects.toThrow("origem fora do ar");
    await expect(cached("neg:k", 30, failing, { negativeTtlSeconds: 8 })).rejects.toThrow("origem fora do ar");
    expect(calls).toBe(1);
    vi.setSystemTime(new Date("2026-09-30T12:00:09Z"));
    const ok = await cached("neg:k", 30, async () => {
      calls++;
      return "voltou";
    });
    expect(ok.value).toBe("voltou");
    expect(calls).toBe(2);
  });

  it("com erro recente e reserva disponível devolve a reserva sem chamar a origem", async () => {
    await cached("neg:stale", 1, async () => "antigo");
    await getCache().del("neg:stale");
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error("x");
    };
    expect(await cached("neg:stale", 1, failing)).toMatchObject({ value: "antigo", stale: true });
    expect(await cached("neg:stale", 1, failing)).toMatchObject({ value: "antigo", stale: true });
    expect(calls).toBe(1);
  });

  it("dentro da janela swr devolve o valor vencido na hora e atualiza em segundo plano", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    await cached("swr:k", 30, async () => "v1", { swrSeconds: 360 });
    vi.setSystemTime(new Date("2026-09-30T12:01:00Z")); // fresco venceu (30 s), reserva tem 60 s
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const r = await cached(
      "swr:k",
      30,
      async () => {
        await gate;
        return "v2";
      },
      { swrSeconds: 360 },
    );
    expect(r).toMatchObject({ value: "v1", stale: false, fromCache: true });
    release();
    await tick();
    expect(await getCache().get("swr:k")).toBe("v2");
    // fora da janela: espera o loader
    vi.setSystemTime(new Date("2026-09-30T12:30:00Z"));
    expect((await cached("swr:k", 30, async () => "v3", { swrSeconds: 360 })).value).toBe("v3");
  });

  it("force ignora o valor fresco; primeCached aquece uma chave irmã", async () => {
    await cached("f:k", 60, async () => 1);
    expect((await cached("f:k", 60, async () => 2, { force: true })).value).toBe(2);
    await primeCached("f:irma", { a: 1 }, 60);
    expect((await cached("f:irma", 60, async () => ({ a: 2 }))).value).toEqual({ a: 1 });
  });

  it("trava distribuída: com a trava ocupada devolve a reserva sem recalcular", async () => {
    await cached("lk:k", 1, async () => "reserva");
    await getCache().del("lk:k");
    expect(await getCache().setNX("lk:k:lock", 1, 15_000)).toBe(true);
    expect(await getCache().setNX("lk:k:lock", 1, 15_000)).toBe(false);
    let calls = 0;
    const r = await cached(
      "lk:k",
      60,
      async () => {
        calls++;
        return "novo";
      },
      { lock: true },
    );
    expect(r).toMatchObject({ value: "reserva", stale: true });
    expect(calls).toBe(0);
  });

  it("memória com teto: as chaves menos usadas saem primeiro", async () => {
    const c = getCache();
    for (let i = 0; i < MEMORY_MAX_ENTRIES + 50; i++) await c.set(`lru:${i}`, i, 60);
    expect(c._memorySize()).toBeLessThanOrEqual(MEMORY_MAX_ENTRIES);
    expect(await c.get("lru:0")).toBeNull();
    expect(await c.get(`lru:${MEMORY_MAX_ENTRIES + 49}`)).toBe(MEMORY_MAX_ENTRIES + 49);
  });
});
