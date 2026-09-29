import { describe, expect, it } from "vitest";
import { acquireCronLock, releaseCronLock, withCronLock } from "@/lib/cron";

describe("trava dos jobs agendados", () => {
  it("segunda execução sobreposta é ignorada; após liberar, roda de novo", async () => {
    const job = `t-${Date.now()}`;
    expect(await acquireCronLock(job, 30)).toBe(true);
    expect(await acquireCronLock(job, 30)).toBe(false);
    await releaseCronLock(job);
    expect(await acquireCronLock(job, 30)).toBe(true);
    await releaseCronLock(job);
  });
  it("withCronLock devolve null para a execução concorrente e libera ao terminar (mesmo com erro)", async () => {
    const job = `w-${Date.now()}`;
    let inner: Promise<string> | null = null;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    inner = withCronLock(job, 30, async () => {
      await gate;
      return "ok";
    }) as Promise<string>;
    await new Promise((r) => setTimeout(r, 10));
    expect(await withCronLock(job, 30, async () => "dup")).toBeNull();
    release();
    expect(await inner).toBe("ok");
    await expect(withCronLock(job, 30, async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await withCronLock(job, 30, async () => "again")).toBe("again");
  });
});
