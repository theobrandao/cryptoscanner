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
