import { describe, expect, it } from "vitest";
import { Deadline, runWithConcurrency } from "@/lib/cron";

describe("orçamento do ciclo (Deadline)", () => {
  it("restante, reserva e orçamento por etapa", () => {
    let now = 1_000;
    const d = new Deadline(110_000, () => now);
    expect(d.remaining()).toBe(110_000);
    now += 80_000;
    expect(d.elapsed()).toBe(80_000);
    expect(d.expired(20_000)).toBe(false);
    expect(d.expired(30_000)).toBe(true);
    expect(d.budget(20_000, 25_000)).toBe(10_000);
    expect(d.budget(0, 5_000)).toBe(5_000);
    now += 60_000;
    expect(d.remaining()).toBe(0);
    expect(d.budget(1_000)).toBe(0);
  });
});

describe("concorrência limitada", () => {
  it("nunca passa do limite e processa todos quando há tempo", async () => {
    let active = 0;
    let peak = 0;
    const r = await runWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((res) => setTimeout(res, 2));
      active--;
      return i * 2;
    });
    expect(peak).toBe(4);
    expect(r.results.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
    expect(r.skipped).toBe(0);
  });

  it("para de iniciar itens quando o orçamento acaba e isola erros", async () => {
    let started = 0;
    const r = await runWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (i) => {
        started++;
        if (i === 2) throw new Error("falhou");
        return i;
      },
      () => started >= 4,
    );
    expect(started).toBe(4);
    expect(r.skipped).toBe(2);
    expect(r.errors.map((e) => e.item)).toEqual([2]);
    expect(r.results.length).toBe(3);
  });
});
