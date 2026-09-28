import { describe, expect, it } from "vitest";
import { filterNewsForSymbol, scoreHeadline, type NewsItem } from "@/services/sentiment/news";

describe("sentimento por léxico", () => {
  it("pontua manchetes positivas e negativas", () => {
    expect(scoreHeadline("Bitcoin surges to record high after ETF approval").score).toBeGreaterThan(0);
    expect(scoreHeadline("Exchange hacked; BTC plunges as liquidations mount").score).toBeLessThan(0);
    expect(scoreHeadline("Weekly newsletter").score).toBeNull();
  });
  it("devolve os termos casados para auditoria", () => {
    const r = scoreHeadline("Solana rally continues as adoption grows");
    expect(r.matched).toContain("+rally");
  });
  it("filtra por ativo e mantém notícias gerais", () => {
    const mk = (title: string): NewsItem => ({ title, link: title, source: "x", publishedAt: 1, score: null, matchedTerms: [] });
    const items = [mk("Ethereum upgrade goes live"), mk("Crypto market steady"), mk("Solana outage"), mk("Bakery opens")];
    const r = filterNewsForSymbol(items, "ETH");
    expect(r[0]!.title).toContain("Ethereum");
    expect(r.some((n) => n.title.includes("Crypto market"))).toBe(true);
    expect(r.some((n) => n.title.includes("Bakery"))).toBe(false);
  });
});
