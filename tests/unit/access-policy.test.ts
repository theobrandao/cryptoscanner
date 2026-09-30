import { describe, expect, it } from "vitest";
import { ALL_TIMEFRAMES, allowsTimeframe, canUse, FEATURE_LEVEL, FEATURES, isIntradayTimeframe, legacyPlanFor, legacyPlanForSalePlan, salePlanForLegacyPlan, TIER_LIMITS, TIERS, TIMEFRAME_FEATURES, timeframesFor, timeframesForLegacyPlan, type Tier } from "@/lib/access-policy";
import { ENTITLEMENTS } from "@/lib/entitlements";
import { PLANS, planAllowsTimeframe } from "@/lib/plans";
import { TIMEFRAMES, type Timeframe } from "@/types/market";

const BASE: Timeframe[] = ["4h", "1d", "1w"];
const INTRADAY: Timeframe[] = ["1m", "5m", "15m", "30m", "1h"];

/** Tabela esperada (decisão aprovada): abaixo de 4H só ELITE/ADMIN; TRIAL e PRO com 4H/1D/1W; NONE nada. */
const EXPECTED_TF: Record<Tier, Timeframe[]> = {
  NONE: [],
  TRIAL: BASE,
  PRO: BASE,
  ELITE: [...TIMEFRAMES],
  ADMIN: [...TIMEFRAMES],
};

describe("access-policy: tier × recurso × timeframe", () => {
  it("classifica intraday como tudo abaixo de 4H", () => {
    expect(TIMEFRAMES.filter(isIntradayTimeframe)).toEqual(INTRADAY);
    expect(ALL_TIMEFRAMES).toEqual([...TIMEFRAMES]);
  });

  const rows = TIERS.flatMap((tier) => TIMEFRAME_FEATURES.flatMap((feature) => TIMEFRAMES.map((tf) => ({ tier, feature, tf, expected: EXPECTED_TF[tier].includes(tf) }))));
  it.each(rows)("$tier · $feature · $tf → $expected", ({ tier, feature, tf, expected }) => {
    expect(allowsTimeframe(tier, tf, feature)).toBe(expected);
  });

  it("timeframesFor segue a tabela", () => {
    for (const tier of TIERS) expect(timeframesFor(tier)).toEqual(EXPECTED_TF[tier]);
  });

  it("timeframe desconhecido nunca é liberado", () => {
    for (const tier of TIERS) expect(allowsTimeframe(tier, "2h")).toBe(false);
  });

  const featureRows = TIERS.flatMap((tier) => FEATURES.map((feature) => ({ tier, feature, expected: tier === "NONE" ? false : FEATURE_LEVEL[feature] === "elite" ? tier === "ELITE" || tier === "ADMIN" : true })));
  it.each(featureRows)("recurso $feature para $tier → $expected", ({ tier, feature, expected }) => {
    expect(canUse(tier, feature)).toBe(expected);
  });
});

describe("access-policy: entitlements e planos legados derivam da mesma regra", () => {
  it("ENTITLEMENTS usa os timeframes e flags da política", () => {
    for (const tier of TIERS) {
      expect(ENTITLEMENTS[tier].tier).toBe(tier);
      expect(ENTITLEMENTS[tier].timeframes).toEqual(EXPECTED_TF[tier]);
      expect(ENTITLEMENTS[tier].core).toBe(canUse(tier, "scanner"));
      expect(ENTITLEMENTS[tier].elite).toBe(canUse(tier, "intradayTimeframes"));
    }
  });

  it("PRO e TRIAL não recebem 1H/30M/15M em nenhuma camada", () => {
    for (const tier of ["PRO", "TRIAL"] as const) for (const tf of INTRADAY) expect(ENTITLEMENTS[tier].timeframes).not.toContain(tf);
    for (const tf of INTRADAY) expect(planAllowsTimeframe("PRO", tf)).toBe(false);
  });

  it("planAllowsTimeframe (User.plan) concorda com o tier equivalente", () => {
    for (const tier of ["TRIAL", "PRO", "ELITE", "ADMIN"] as const) {
      const plan = legacyPlanFor(tier);
      for (const tf of TIMEFRAMES) expect(planAllowsTimeframe(plan, tf)).toBe(allowsTimeframe(tier, tf));
      expect(PLANS[plan].timeframes).toEqual(timeframesForLegacyPlan(plan));
    }
  });

  it("limites mantidos (sem mudança comercial)", () => {
    expect(TIER_LIMITS.TRIAL).toEqual({ maxAlerts: 5, maxMonitors: 1, maxStrategies: 2, aiQueriesPerDay: 10, historyDays: 90 });
    expect(TIER_LIMITS.PRO).toEqual({ maxAlerts: 50, maxMonitors: 5, maxStrategies: 10, aiQueriesPerDay: 100, historyDays: 365 });
    expect(TIER_LIMITS.ELITE).toEqual({ maxAlerts: 200, maxMonitors: 20, maxStrategies: 50, aiQueriesPerDay: 500, historyDays: 1095 });
    expect(TIER_LIMITS.ADMIN.aiQueriesPerDay).toBe(5000);
    expect(TIER_LIMITS.NONE.aiQueriesPerDay).toBe(0);
    expect(ENTITLEMENTS.PRO.aiQueriesPerDay).toBe(100);
    expect(PLANS.PLATINUM.maxAgents).toBe(15);
    expect(PLANS.PRO.maxAgents).toBe(5);
  });

  it("conversão ELITE ↔ PLATINUM centralizada", () => {
    expect(legacyPlanForSalePlan("ELITE")).toBe("PLATINUM");
    expect(legacyPlanForSalePlan("PRO")).toBe("PRO");
    expect(salePlanForLegacyPlan("PLATINUM")).toBe("ELITE");
    expect(salePlanForLegacyPlan("PRO")).toBe("PRO");
    expect(salePlanForLegacyPlan("FREE")).toBeNull();
    expect(legacyPlanFor("ELITE")).toBe("PLATINUM");
    expect(legacyPlanFor("ADMIN")).toBe("PLATINUM");
    expect(legacyPlanFor("TRIAL")).toBe("PRO");
    expect(legacyPlanFor("NONE")).toBe("FREE");
  });
});
