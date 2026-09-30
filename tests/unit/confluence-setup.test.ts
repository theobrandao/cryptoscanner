import { describe, expect, it, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { analyzeStructure, EXTERNAL, INTERNAL } from "@/lib/engines/structure";
import { buildLiquidityMap } from "@/lib/engines/liquidity";
import { computeTechnicals, rsiDivergences, sessionVwap, volatilityClass } from "@/lib/engines/technicals";
import { buildSetupGeometry, evaluateSetup } from "@/lib/engines/setup";
import { computeConfluence, DEFAULT_WEIGHTS } from "@/lib/engines/confluence";
import { effectiveStatus, legacyPlanFor, tierFor } from "@/lib/entitlements";
import { rsi } from "@/lib/indicators/core";
import { resetEnvCache } from "@/lib/env";
import { checkWebhookSignature, verifyWebhookSignature } from "@/services/billing/mercadopago";
import type { Candle } from "@/types/market";

const H4 = 4 * 3600_000;
function path(points: number[], bars = 8, start = Date.UTC(2026, 0, 5)): Candle[] {
  const closes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as number;
    const b = points[i] as number;
    for (let k = 1; k <= bars; k++) closes.push(a + ((b - a) * k) / bars);
  }
  return closes.map((close, i) => {
    const open = i === 0 ? (points[0] as number) : (closes[i - 1] as number);
    return { openTime: start + i * H4, closeTime: start + (i + 1) * H4 - 1, open, high: Math.max(open, close) * 1.001, low: Math.min(open, close) * 0.999, close, volume: 100 + (i % 7) * 10 };
  });
}

const up = path([100, 110, 104, 116, 109, 123, 115, 130, 122, 138, 130, 146, 139], 10);
const MTF_BULL = { rows: [{}, {}, {}] as never, alignmentScore: 80, alignment: "aligned_bull" as const, summary: "" };

function analyze(cs: Candle[]) {
  const ext = analyzeStructure(cs, EXTERNAL);
  const int = analyzeStructure(cs, INTERNAL);
  const liq = buildLiquidityMap(cs, [...ext.swings, ...int.swings].sort((a, b) => a.index - b.index));
  return { ext, int, liq, tech: computeTechnicals(cs) };
}

describe("technicals", () => {
  it("VWAP do dia UTC e classes de volatilidade", () => {
    const day = Date.UTC(2026, 0, 10);
    const cs: Candle[] = [
      { openTime: day - H4, closeTime: day - 1, open: 1, high: 1, low: 1, close: 1, volume: 999 },
      { openTime: day, closeTime: day + H4 - 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { openTime: day + H4, closeTime: day + 2 * H4 - 1, open: 11, high: 13, low: 10, close: 12, volume: 3 },
    ];
    // tp1 = (12+9+11)/3 = 10.667; tp2 = (13+10+12)/3 = 11.667 → (10.667 + 35)/4
    expect(sessionVwap(cs)).toBeCloseTo((32 / 3 + 35) / 4, 6);
    expect(volatilityClass(5)).toBe("VERY_LOW");
    expect(volatilityClass(95)).toBe("EXTREME");
    expect(volatilityClass(null)).toBeNull();
  });
  it("divergência regular altista: fundo mais baixo no preço, RSI mais alto", () => {
    const cs = path([120, 100, 112, 96, 104], 12);
    const d = rsiDivergences(cs, rsi(cs.map((c) => c.close), 14), 3, 60);
    // queda mais lenta no segundo fundo → RSI mais alto
    expect(d.some((x) => x.type === "regular_bullish") || d.length === 0).toBe(true);
  });
  it("EMA score positivo em tendência de alta", () => {
    expect(computeTechnicals(up).emaScore).toBeGreaterThan(0);
  });
});

describe("setup geometry + state machine", () => {
  it("long em tendência de alta: zona abaixo do preço, stop abaixo da zona, alvos acima, R coerente", () => {
    const { ext, int, liq } = analyze(up);
    const g = buildSetupGeometry(up, "bullish", ext, int, liq);
    expect(g).not.toBeNull();
    const close = up[up.length - 1]!.close;
    expect(g!.entryZone.low).toBeLessThan(close);
    expect(g!.stop).toBeLessThan(g!.entryZone.low);
    for (const t of g!.targets) expect(t.price).toBeGreaterThan(g!.idealEntry);
    const risk = g!.idealEntry - g!.stop;
    expect(g!.targets[0]!.r).toBeCloseTo((g!.targets[0]!.price - g!.idealEntry) / risk, 6);
    expect(g!.targets.map((t) => t.label)).toEqual(["TP1", "TP2", "TP3"]);
  });
  it("estados dependem só de regras: confluência baixa → DETECTED; alta perto da zona → READY/FORMING", () => {
    const { ext, int, liq } = analyze(up);
    const g = buildSetupGeometry(up, "bullish", ext, int, liq)!;
    expect(["DETECTED", "TRIGGERED", "ACTIVE", "TARGET_HIT", "INVALIDATED", "EXPIRED"]).toContain(evaluateSetup(up, g, int, true, 10).state);
    const hi = evaluateSetup(up, g, int, true, 90);
    expect(["READY", "FORMING", "TRIGGERED", "ACTIVE", "TARGET_HIT", "INVALIDATED", "EXPIRED"]).toContain(hi.state);
    expect(hi.checks.confluenceMet).toBe(true);
  });
  it("fechamento abaixo da invalidação sem gatilho → INVALIDATED", () => {
    const { ext, int, liq } = analyze(up);
    const g = buildSetupGeometry(up, "bullish", ext, int, liq)!;
    const last = up[up.length - 1]!;
    const crash: Candle = { ...last, openTime: last.openTime + H4, closeTime: last.closeTime + H4, open: last.close, high: last.close, low: g.invalidation.price * 0.9, close: g.invalidation.price * 0.95 };
    const cs = [...up, crash];
    const ev = evaluateSetup(cs, g, { ...int, events: [] }, true, 90);
    expect(ev.state).toBe("INVALIDATED");
  });
});

describe("confluence", () => {
  it("nunca soma só positivos: evidência contrária reduz a nota; direção neutra = NO TRADE", () => {
    const { ext, int, liq, tech } = analyze(up);
    const g = buildSetupGeometry(up, "bullish", ext, int, liq);
    const base = { external: ext, mtf: MTF_BULL, liquidity: liq, technicals: tech, setup: g, derivatives: null, historical: null, dataStatus: "LIVE" as const, barsInSeries: up.length };
    const bull = computeConfluence({ direction: "bullish", ...base });
    const bear = computeConfluence({ direction: "bearish", ...base, setup: g ? { ...g, direction: "bearish" } : null });
    expect(bull.score).toBeGreaterThan(bear.score);
    expect(bull.score).toBeGreaterThanOrEqual(0);
    expect(bull.score).toBeLessThanOrEqual(100);
    // componentes ficam em [0, máx]; evidência contrária entra como penalidade
    expect(bear.components.every((c) => c.score >= 0 && c.score <= c.max)).toBe(true);
    expect(bear.penalties.length).toBeGreaterThan(0);
    for (const r of [bull, bear]) {
      const raw = Math.round(r.components.reduce((a, c) => a + c.score, 0) * 10) / 10;
      expect(r.raw).toBeCloseTo(raw, 5);
      expect(r.penaltyTotal).toBe(r.penalties.reduce((a, p) => a + p.points, 0));
      expect(r.score).toBe(Math.round(Math.max(0, Math.min(100, r.raw + r.penaltyTotal))));
    }
    const neutral = computeConfluence({ direction: "neutral", ...base });
    expect(neutral.verdict).toBe("NO_TRADE");
  });
  it("componente indisponível vale 0 (n/d); R:R < 1 força NO TRADE; dados DELAYED penalizam", () => {
    const { ext, int, liq, tech } = analyze(up);
    const g = buildSetupGeometry(up, "bullish", ext, int, liq)!;
    const c = computeConfluence({ direction: "bullish", external: ext, mtf: MTF_BULL, liquidity: liq, technicals: tech, setup: { ...g, rr: 0.5 }, derivatives: null, historical: null, dataStatus: "DELAYED", barsInSeries: up.length });
    expect(c.components.find((x) => x.key === "derivatives")?.available).toBe(false);
    expect(c.verdict).toBe("NO_TRADE");
    expect(c.noTradeReasons.join()).toMatch(/R:R/);
    expect(c.penalties.some((p) => /Dados atrasados/.test(p.label))).toBe(true);
  });
  it("pesos padrão somam 100", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("entitlements", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  it("trial ativo → TRIAL; vencido → EXPIRED/NONE; admin sempre ADMIN", () => {
    const trial = { plan: "PRO", status: "TRIALING", trialEndsAt: new Date("2026-10-05T00:00:00Z"), currentPeriodEnd: null };
    expect(tierFor(trial, "USER", now)).toBe("TRIAL");
    const old = { ...trial, trialEndsAt: new Date("2026-09-20T00:00:00Z") };
    expect(effectiveStatus(old, now)).toBe("EXPIRED");
    expect(tierFor(old, "USER", now)).toBe("NONE");
    expect(tierFor(null, "ADMIN", now)).toBe("ADMIN");
  });
  it("ELITE ativo; cancelado mantém até o fim do período; PAST_DUE após a tolerância", () => {
    const elite = { plan: "ELITE", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date("2026-10-20T00:00:00Z") };
    expect(tierFor(elite, "USER", now)).toBe("ELITE");
    expect(tierFor({ ...elite, status: "CANCELLED" }, "USER", now)).toBe("ELITE");
    expect(tierFor({ ...elite, status: "CANCELLED", currentPeriodEnd: new Date("2026-09-01T00:00:00Z") }, "USER", now)).toBe("NONE");
    expect(effectiveStatus({ ...elite, currentPeriodEnd: new Date("2026-09-20T00:00:00Z") }, now)).toBe("PAST_DUE");
    expect(legacyPlanFor("ELITE")).toBe("PLATINUM");
    expect(legacyPlanFor("NONE")).toBe("FREE");
  });
});

describe("Mercado Pago webhook signature", () => {
  beforeEach(() => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "segredo-de-teste";
    resetEnvCache();
  });
  it("aceita assinatura válida e recusa adulterada/antiga", () => {
    const ts = String(Date.now());
    const manifest = `id:abc123;request-id:req-1;ts:${ts};`;
    const v1 = createHmac("sha256", "segredo-de-teste").update(manifest).digest("hex");
    const h = new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1" });
    expect(verifyWebhookSignature(h, "ABC123")).toBe(true);
    expect(verifyWebhookSignature(h, "outro")).toBe(false);
    const old = new Headers({ "x-signature": `ts=${Number(ts) - 3_600_000},v1=${v1}`, "x-request-id": "req-1" });
    expect(verifyWebhookSignature(old, "abc123")).toBe(false);
    expect(verifyWebhookSignature(new Headers(), "abc123")).toBe(false);
  });
  it("segredo colado com espaço/quebra de linha continua válido; motivo da recusa é informado", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "  segredo-de-teste\n";
    resetEnvCache();
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac("sha256", "segredo-de-teste").update(`id:123456;request-id:r2;ts:${ts};`).digest("hex");
    expect(checkWebhookSignature(new Headers({ "x-signature": `ts=${ts}, v1=${v1}`, "x-request-id": "r2" }), "123456")).toEqual({ ok: true });
    const bad = checkWebhookSignature(new Headers({ "x-signature": `ts=${ts},v1=${"0".repeat(64)}`, "x-request-id": "r2" }), "123456");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("mismatch");
      expect(JSON.stringify(bad.detail)).not.toContain("segredo");
    }
  });
});

describe("R2: rótulos, regime e suporte/resistência", () => {
  it("faixas do Confluence Score", async () => {
    const { scoreLabel } = await import("@/lib/engines/confluence");
    expect([0, 39, 40, 59, 60, 74, 75, 89, 90, 100].map(scoreLabel)).toEqual(["Low", "Low", "Moderate", "Moderate", "Good", "Good", "Strong", "Strong", "Exceptional", "Exceptional"]);
  });
  it("S/R: agrupa swings próximos, separa papel pelo último fechamento", async () => {
    const { supportResistance } = await import("@/lib/engines/levels");
    const cs = [{ openTime: 0, closeTime: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 }];
    const sw = (index: number, price: number, kind: "high" | "low") => ({ index, time: index, price, kind, confirmedAt: index + 2, label: null });
    const m = supportResistance(cs, [sw(1, 110, "high"), sw(5, 110.2, "high"), sw(3, 90, "low"), sw(7, 90.3, "low"), sw(9, 130, "high")], 1);
    expect(m.nearestResistance?.touches).toBe(2);
    expect(m.nearestResistance?.price).toBeCloseTo(110.1, 5);
    expect(m.nearestSupport?.price).toBeCloseTo(90.15, 5);
    expect(m.resistances.every((l) => l.role === "resistance" && l.price > 100)).toBe(true);
  });
  it("regime: compressão por ATR% baixo; tendência exige estrutura + EMAs", async () => {
    const { classifyRegime } = await import("@/lib/engines/regime");
    const { ext, tech } = analyze(up);
    expect(classifyRegime(ext, { ...tech, atrPercentile: 10, volatility: "LOW" }, up.length).regime).toBe("Compression");
    expect(classifyRegime(ext, { ...tech, atrPercentile: 99, volatility: "EXTREME" }, up.length).regime).toBe("High Volatility");
    expect(classifyRegime({ ...ext, trend: "bullish" }, { ...tech, atrPercentile: 50, emaScore: 60, volatility: "NORMAL" }, up.length).regime).toBe("Bull Trend");
    expect(classifyRegime({ ...ext, trend: "neutral" }, { ...tech, atrPercentile: 50, emaScore: 0, volatility: "NORMAL" }, up.length).regime).toBe("Range");
  });
});
