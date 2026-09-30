import { describe, expect, it } from "vitest";
import { numbersInText, unknownNumbers } from "@/services/ai-analyst-service";

describe("AI Analyst — guardrail numérico", () => {
  it("extrai números em formatos en-US, pt-BR, % e R", () => {
    expect(numbersInText("preço 84,309.9 e 84.309,9; funding 0.0081% e -0.23R")).toEqual([84309.9, 84309.9, 0.0081, -0.23]);
  });
  it("aceita números do contexto (arredondados, em % ou milhões) e recusa inventados", () => {
    const ctx = { price: 84309.9, fundingRate: 0.000081, oiUsd: 2_390_000_000, score: 46, expectancyR: -0.2312 };
    expect(unknownNumbers("Preço 84,310 com funding 0.0081%, OI 2.39 bi, score 46 e expectativa -0.23R.", ctx)).toEqual([]);
    expect(unknownNumbers("Alvo provável em 90,000 com 72% de chance.", ctx)).toEqual([90000, 72]);
  });
  it("inteiros pequenos (contagens) são livres", () => {
    expect(unknownNumbers("3 timeframes e 2 penalidades", {})).toEqual([]);
  });
});

describe("AI Analyst — guardrail por precisão escrita", () => {
  it("número com 1 casa só casa com valores que arredondam para ele", () => {
    const ctx = { hitRatePct: [74.1, 62.5, 55.0], samples: 599 };
    expect(unknownNumbers("Probabilidade estimada de 73.9%.", ctx)).toEqual([73.9]);
    expect(unknownNumbers("Acerto de 74.1% em 599 amostras.", ctx)).toEqual([]);
    expect(unknownNumbers("Acerto de 62,5% e 55%.", ctx)).toEqual([]);
  });
  it("preço grande escrito arredondado segue aceito; bilhões e mil também", () => {
    const ctx = { price: 67012.4, cap: 2_345_000_000_000 };
    expect(unknownNumbers("BTC em 67,012 (67.012) e capitalização de 2.345 bi… ou 2,35 tri", ctx).includes(67012)).toBe(false);
    expect(unknownNumbers("BTC perto de 67 mil", { price: 67012.4 })).toEqual([]);
  });
  it("padrão brasileiro e separador ambíguo (milhar ou decimal) aceitam a leitura que existe nos dados", () => {
    const ctx = { price: 119.26, zoneHigh: 117360.5, atr: 1.234 };
    expect(unknownNumbers("SOL em 119,26; zona até US$ 117.360,50; 1,234 ATR", ctx)).toEqual([]);
    expect(unknownNumbers("SOL em 119,260 e ATR 1.234", ctx)).toEqual([]);
    expect(unknownNumbers("SOL em 119,960", ctx)).toEqual([119960]);
  });
});
