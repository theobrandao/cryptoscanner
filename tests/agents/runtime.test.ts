import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createToolRegistry, defineAgent, runAgent } from "@/agents/runtime";

const echo = defineAgent<{ n: number }, { doubled: number }>({
  name: "echo",
  purpose: "teste",
  inputs: ["n"],
  outputs: ["doubled"],
  allowedTools: ["calc"],
  rules: [],
  timeoutMs: 200,
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ doubled: z.number() }),
  async run(input, ctx) {
    const calc = ctx.tools.use<{ mul: (a: number, b: number) => number }>("calc");
    ctx.log("info", "calculando");
    return { doubled: calc.mul(input.n, 2) };
  },
});

describe("runtime dos agentes", () => {
  const tools = { calc: { mul: (a: number, b: number) => a * b }, forbidden: {} };

  it("executa com validação de entrada e saída", async () => {
    const r = await runAgent(echo, { n: 21 }, { tools });
    expect(r.status).toBe("ok");
    expect(r.output).toEqual({ doubled: 42 });
    expect(r.logs.some((l) => l.message === "calculando")).toBe(true);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejeita entrada inválida sem lançar", async () => {
    const r = await runAgent(echo, { n: "x" }, { tools });
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/entrada inválida/);
  });

  it("bloqueia ferramenta não permitida", () => {
    const reg = createToolRegistry("echo", ["calc"], tools);
    expect(() => reg.use("forbidden")).toThrow(/não permitida/);
    expect(reg.has("calc")).toBe(true);
    expect(reg.has("forbidden")).toBe(false);
  });

  it("aplica timeout e usa fallback", async () => {
    const slow = defineAgent<{ n: number }, { v: number }>({
      ...echo,
      name: "slow",
      allowedTools: [],
      outputSchema: z.object({ v: z.number() }),
      timeoutMs: 30,
      async run() {
        await new Promise((r) => setTimeout(r, 200));
        return { v: 1 };
      },
      fallback() {
        return { v: -1 };
      },
    });
    const r = await runAgent(slow, { n: 1 }, { tools });
    expect(r.status).toBe("fallback");
    expect(r.output).toEqual({ v: -1 });
    expect(r.error).toMatch(/timeout/);
  });

  it("marca erro quando a saída viola o schema", async () => {
    const bad = defineAgent<{ n: number }, { doubled: number }>({
      ...echo,
      name: "bad",
      allowedTools: [],
      async run() {
        return { doubled: "não é número" } as unknown as { doubled: number };
      },
    });
    const r = await runAgent(bad, { n: 1 }, { tools });
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/saída inválida/);
  });
});
