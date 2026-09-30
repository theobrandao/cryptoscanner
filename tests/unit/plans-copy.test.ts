import { describe, expect, it } from "vitest";
import { CANCEL_REASON_LABELS, ELITE_DIFFERENTIALS, formatBRL, gateCopy, PLAN_FEATURES, SUPPORT_PATHS, supportSubjectFromParam } from "@/lib/plans-copy";
import { CANCEL_REASONS } from "@/services/analytics-service";
import { ENTITLEMENTS } from "@/lib/entitlements";

describe("textos de planos — ELITE, bloqueios e suporte", () => {
  it("diferenciais do ELITE vêm de PLAN_FEATURES.ELITE, sem 'Tudo do PRO' e sem itens que o PRO já tem", () => {
    expect(ELITE_DIFFERENTIALS.length).toBe(PLAN_FEATURES.ELITE.length - 1);
    expect(ELITE_DIFFERENTIALS).not.toContain("Tudo do PRO");
    for (const f of ELITE_DIFFERENTIALS) expect(PLAN_FEATURES.ELITE).toContain(f);
    expect(ELITE_DIFFERENTIALS.join(" ")).not.toMatch(/Telegram|sem limite/i);
    expect(ELITE_DIFFERENTIALS.some((f) => f.includes(`${ENTITLEMENTS.ELITE.aiQueriesPerDay} consultas/dia`))).toBe(true);
  });
  it("preço em reais sem casas para inteiros", () => {
    expect(formatBRL(97)).toBe("R$ 97");
    expect(formatBRL(197)).toBe("R$ 197");
    expect(formatBRL(97.9)).toBe("R$ 97,90");
  });
  it("bloqueio: uma linha por ferramenta, nomes antigos traduzidos e texto padrão", () => {
    expect(gateCopy("Agentes IA").benefit).toMatch(/avisam/);
    expect(gateCopy("Strategies")).toEqual({ title: "Construtor de estratégias", benefit: expect.stringMatching(/regras próprias/) });
    expect(gateCopy("Derivativos — detalhes").title).toBe("Derivativos");
    expect(gateCopy("Esta ferramenta").benefit).toMatch(/PRO e ELITE/);
  });
  it("motivos de cancelamento batem com os aceitos no evento", () => {
    expect(CANCEL_REASON_LABELS.map((r) => r.key)).toEqual([...CANCEL_REASONS]);
  });
  it("caminhos do suporte com assunto", () => {
    expect(SUPPORT_PATHS.payment).toBe("/suporte?assunto=pagamento");
    expect(decodeURIComponent(SUPPORT_PATHS.cancel)).toBe("/suporte?assunto=Cancelar assinatura");
  });
  it("assunto do formulário de suporte a partir de ?assunto=", () => {
    const param = (path: string) => new URL(path, "http://x").searchParams.get("assunto");
    expect(supportSubjectFromParam(param(SUPPORT_PATHS.payment))).toBe("Problema com o pagamento");
    expect(supportSubjectFromParam(param(SUPPORT_PATHS.cancel))).toBe("Cancelar assinatura");
    expect(supportSubjectFromParam(param(SUPPORT_PATHS.reactivate))).toBe("Reativar renovação");
    expect(supportSubjectFromParam("  Reembolso ")).toBe("Reembolso");
    expect(supportSubjectFromParam(null)).toBe("");
    expect(supportSubjectFromParam(["pagamento", "x"])).toBe("Problema com o pagamento");
    expect(supportSubjectFromParam("ab")).toBe("");
    expect(supportSubjectFromParam("x".repeat(200))).toBe("");
  });
});
