import { describe, expect, it } from "vitest";
import { allowedNumbersFrom, ANALYST_TOOLS, runTool, systemPrompt } from "@/services/analyst-chat-service";
import { unknownNumbers } from "@/services/ai-analyst-service";

const env = { selection: { symbol: "BTC", tf: "4h" as const, exchange: "binance" as const, instrument: "spot" as const }, timeframes: ["1h", "4h", "1d", "1w"] };

describe("Analista IA v2 — ferramentas e regras", () => {
  it("expõe as 7 ferramentas com schema de entrada", () => {
    expect(ANALYST_TOOLS.map((t) => t.name)).toEqual(["contexto_ativo", "sinais_modelo", "scanner_padroes", "taxa_acerto", "panorama_mercado", "cotacao", "propor_alerta"]);
    for (const t of ANALYST_TOOLS) expect(t.input_schema.type).toBe("object");
  });
  it("prompt proíbe recomendação e número fora das ferramentas e traz o contexto da tela", () => {
    const p = systemPrompt(env.selection, { tier: "PRO", timeframes: env.timeframes, now: new Date("2026-09-29T12:00:00Z") });
    expect(p).toMatch(/Não recomende comprar, vender/);
    expect(p).toMatch(/precisa ter vindo do resultado de uma ferramenta/);
    expect(p).toMatch(/ativo BTC, timeframe 4H/);
  });
  it("proposta de alerta só devolve a ação (não cria nada) e valida entrada", async () => {
    const ok = (await runTool("propor_alerta", { symbol: "btcusdt", kind: "price_below", threshold: 61000.5, note: "suporte 4H" }, env)) as { action: { symbol: string; alertKind: string; threshold: number } };
    expect(ok.action).toMatchObject({ symbol: "BTC", alertKind: "price_below", threshold: 61000.5 });
    expect(await runTool("propor_alerta", { symbol: "XYZ", kind: "price_below", threshold: 1, note: "" }, env)).toMatchObject({ error: expect.any(String) });
    expect(await runTool("propor_alerta", { symbol: "BTC", kind: "compre", threshold: -1, note: "" }, env)).toMatchObject({ error: expect.any(String) });
  });
  it("recusa ativo não monitorado, timeframe fora do plano e ferramenta desconhecida sem lançar erro", async () => {
    expect(await runTool("contexto_ativo", { symbol: "DOGEX" }, env)).toMatchObject({ error: expect.stringMatching(/não monitorado/) });
    expect(await runTool("contexto_ativo", { symbol: "BTC", tf: "1m" }, { ...env, timeframes: ["4h"] })).toMatchObject({ error: expect.stringMatching(/não incluído/) });
    expect(await runTool("scanner_padroes", { tf: "1h" }, env)).toMatchObject({ error: expect.stringMatching(/4h e 1d/) });
    expect(await runTool("apagar_tudo", {}, env)).toMatchObject({ error: expect.stringMatching(/desconhecida/) });
  });
  it("guarda-corpo usa resultados das ferramentas, a pergunta, tamanhos de lista e datas", () => {
    const results = [{ active: [{ symbol: "SOL", entry: 142.35, stop: 131.2, openR: 0.84 }, { symbol: "AVAX" }], generatedAt: "2026-09-29T12:00:00.000Z" }];
    const allowed = allowedNumbersFrom(results, "compare com 150 dólares");
    expect(unknownNumbers("2 posições abertas; SOL entrou em 142,35 com stop em 131,2 (+0,84R). Você citou 150. Dados de 29/09/2026.", allowed)).toEqual([]);
    expect(unknownNumbers("Alvo provável em 165 com 68% de chance.", allowed)).toEqual([165, 68]);
  });
});
