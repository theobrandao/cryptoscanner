import { z } from "zod";
import { completeJson, getLlmInfo } from "@/services/llm";
import { createLogger } from "@/lib/logger";
import { INSTRUMENT_LABEL, VENUE_LABEL } from "@/lib/venues";
import { candlesAgo, CONDITION_PT, PHASE_PT, POOL_KIND_PT, pt, REGIME_PT, SCORE_LABEL_PT, SETUP_STATE_PT } from "@/lib/display-labels";
import type { MarketContext } from "@/services/market-context-service";

const log = createLogger("ai-analyst");

/**
 * AI Analyst — leitura do MESMO contexto exibido no Dashboard (exchange × instrumento × ativo × timeframe).
 *
 * 1. Resumo determinístico: frases montadas só com números do contexto (sempre disponível).
 * 2. Interpretação por LLM (opcional): recebe o contexto estruturado; toda saída passa por schema e por
 *    uma checagem numérica — qualquer número que não exista no contexto descarta a interpretação.
 * O analista não calcula preço, indicador ou probabilidade, e não dá ordem de compra/venda.
 */
export interface AnalystSection {
  title: string;
  lines: string[];
}

export interface AnalystReply {
  contextKey: string;
  generatedAt: number;
  headline: string;
  sections: AnalystSection[];
  interpretation: { summary: string; risks: string[]; watch: string[] } | null;
  guardrail: { llm: "not_configured" | "not_requested" | "ok" | "rejected" | "error"; detail: string | null };
  disclaimer: string;
}

const DISCLAIMER = "Leitura técnica do contexto atual, não é recomendação de investimento. Confluence Score mede qualidade de confluência, não probabilidade.";

const f = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "n/d" : v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const px = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "n/d";
  const d = v >= 1000 ? 1 : v >= 1 ? 3 : 6;
  return f(v, d);
};
const dirPt = (d: string | null | undefined) => (d === "bullish" ? "altista" : d === "bearish" ? "baixista" : "neutra");

export function deterministicBrief(c: MarketContext): { headline: string; sections: AnalystSection[] } {
  const venue = `${VENUE_LABEL[c.exchange]} ${INSTRUMENT_LABEL[c.instrument]}`;
  const conf = c.confluence;
  const s = c.setup;
  const fb = c.dataVenue !== c.exchange ? ` (dados de ${VENUE_LABEL[c.dataVenue]}, fonte alternativa)` : "";
  const regime = pt(REGIME_PT, c.regime.regime).toLowerCase();
  const VERDICT_PT: Record<string, string> = { TRADE_CANDIDATE: "candidato", WATCH: "observar", NO_TRADE: "sem entrada" };
  const headline = `${c.symbol}/USDT · ${venue}${fb} · ${c.timeframe.toUpperCase()} — estrutura ${dirPt(c.structure.trend)}, regime ${regime}, Confluence ${conf.score}/100 (${pt(SCORE_LABEL_PT, conf.label).toLowerCase()}).`;
  const sections: AnalystSection[] = [];

  const st = c.structure;
  sections.push({
    title: "Estrutura",
    lines: [
      `Viés ${dirPt(st.trend)} · sequência ${st.sequence || "—"} · fase ${pt(PHASE_PT, st.phase).toLowerCase()}.`,
      st.lastBos ? `Último BOS ${dirPt(st.lastBos.direction)} em ${px(st.lastBos.level)}.` : "Sem BOS externo recente.",
      st.lastChoch ? `Último ${st.lastChoch.type} ${dirPt(st.lastChoch.direction)} em ${px(st.lastChoch.level)}.` : "Sem CHoCH/MSS externo recente.",
      `Regime ${regime}: ${c.regime.reasons.join("; ")}.`,
    ],
  });

  const l = c.liquidity;
  const lv = c.levels;
  sections.push({
    title: "Liquidez e níveis",
    lines: [
      l.above ? `Liquidez acima: ${pt(POOL_KIND_PT, l.above.kind)} em ${px((l.above.low + l.above.high) / 2)} (${f(l.above.distanceAtr, 1)} ATR).` : "Sem liquidez disponível acima no recorte.",
      l.below ? `Liquidez abaixo: ${pt(POOL_KIND_PT, l.below.kind)} em ${px((l.below.low + l.below.high) / 2)} (${f(Math.abs(l.below.distanceAtr), 1)} ATR).` : "Sem liquidez disponível abaixo no recorte.",
      lv.nearestResistance ? `Resistência mais próxima ${px(lv.nearestResistance.price)} (${lv.nearestResistance.touches} toques).` : "Sem resistência por swings acima.",
      lv.nearestSupport ? `Suporte mais próximo ${px(lv.nearestSupport.price)} (${lv.nearestSupport.touches} toques).` : "Sem suporte por swings abaixo.",
      l.recentSweeps[0] ? `Varredura recente: ${pt(POOL_KIND_PT, l.recentSweeps[0].kind)} em ${px(l.recentSweeps[0].price)} ${candlesAgo(l.recentSweeps[0].barsAgo)}.` : "Sem varredura recente.",
    ],
  });

  const top = [...conf.components].filter((x) => x.available).sort((a, b) => b.score / b.max - a.score / a.max);
  sections.push({
    title: "Confluence Score",
    lines: [
      `Final ${conf.score}/100 = componentes ${f(conf.raw, 1)} ${conf.penaltyTotal <= 0 ? "−" : "+"} penalidades ${f(Math.abs(conf.penaltyTotal), 1)} (${pt(SCORE_LABEL_PT, conf.label).toLowerCase()}; ${VERDICT_PT[conf.verdict] ?? conf.verdict}).`,
      top.length ? `Mais fortes: ${top.slice(0, 2).map((x) => `${x.label} ${f(x.score, 1)}/${x.max}`).join(", ")}.` : "Nenhum componente disponível.",
      conf.penalties.length ? `Penalidades: ${conf.penalties.map((p) => `${p.label} (${p.points})`).join(", ")}.` : "Sem penalidades.",
      ...conf.components.filter((x) => !x.available).map((x) => `${x.label}: n/d (${x.reasons[0] ?? "sem dado"}).`),
    ],
  });

  sections.push({
    title: "Setup",
    lines: s
      ? [
          `Estado ${pt(SETUP_STATE_PT, s.state).toLowerCase()} (${dirPt(s.direction)}): ${s.stateReason}.`,
          `Zona de entrada ${px(s.entryZone.low)}–${px(s.entryZone.high)} · invalidação ${px(s.invalidation.price)} (${s.invalidation.source}) · stop ${px(s.stop)}.`,
          `Alvos: ${s.targets.map((t) => `${t.label} ${px(t.price)} (${f(t.r, 2)}R)`).join(" · ") || "n/d"}.`,
          s.triggerLevel ? `Gatilho: fechamento além de ${px(s.triggerLevel.price)} (${s.triggerLevel.source}).` : "Gatilho: aguardando swing interno a favor.",
          ...conf.noTradeReasons.map((r) => `Sem entrada: ${r}.`),
        ]
      : [`Sem setup (${pt(CONDITION_PT, conf.condition)}): ${conf.noTradeReasons[0] ?? "sem geometria de entrada, invalidação e alvo"}.`],
  });

  const d = c.derivatives;
  sections.push({
    title: "Derivativos",
    lines: d
      ? [
          `Funding ${f(d.fundingRate * 100, 4)}% · próximo em ${new Date(d.nextFundingTime).toISOString().slice(11, 16)} UTC.`,
          `Open interest ${d.openInterestUsd != null ? `US$ ${f(d.openInterestUsd / 1e6, 1)} mi` : "n/d"}${d.openInterestChange24hPct != null ? ` (${f(d.openInterestChange24hPct, 1)}% em 24h)` : ""}.`,
          d.longShortRatio != null ? `Long/short de contas ${f(d.longShortRatio, 2)}.` : "Long/short: n/d nesta exchange.",
        ]
      : [c.derivativesError ?? "Derivativos indisponíveis."],
  });

  const h = c.historical;
  sections.push({
    title: "Histórico do setup",
    lines: h
      ? [
          `n=${h.samples}${h.scope === "universe" ? " (universo de 30 ativos)" : ""} · expectativa ${h.expectancyR != null ? `${f(h.expectancyR, 2)}R` : "n/d"} · PF ${h.profitFactor != null ? f(h.profitFactor, 2) : "n/d"}.`,
          `Atingiram 1R/2R/3R: ${[h.hit1R, h.hit2R, h.hit3R].map((x) => (x == null ? "n/d" : `${Math.round(x * 100)}%`)).join(" / ")} · MFE médio ${f(h.avgMfeR, 2)}R · MAE médio ${f(h.avgMaeR, 2)}R.`,
          h.smallSample ? `Amostra pequena (n < ${h.minSample}): não usar isoladamente.` : `Base: ${h.dataSource}.`,
        ]
      : ["Sem backtest para este ativo/timeframe."],
  });
  return { headline, sections };
}

/* ------------------------------------------------------------------ guardrail numérico */

/** Contexto compacto enviado ao LLM (sem candles). */
export function compactContext(c: MarketContext) {
  const { candles: _c, forming: _f, structure, liquidity, ...rest } = c;
  void _c;
  void _f;
  return {
    ...rest,
    structure: { trend: structure.trend, sequence: structure.sequence, lastBos: structure.lastBos, lastChoch: structure.lastChoch, phase: structure.phase },
    liquidity: { above: liquidity.above, below: liquidity.below, recentSweeps: liquidity.recentSweeps.slice(0, 3), availableAbove: liquidity.availableAbove, availableBelow: liquidity.availableBelow },
  };
}

function collectNumbers(v: unknown, out: number[]) {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectNumbers(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collectNumbers(x, out);
}

/** Números citados no texto com a quantidade de casas decimais escritas (aceita 1,234.5 / 1.234,5 / 12% / -0.8R). */
export interface ParsedNumber {
  value: number;
  decimals: number;
  /** Leitura alternativa quando o separador é ambíguo ("119,260" ou "1.234": milhar ou decimal). */
  alt?: { value: number; decimals: number };
}

export function numbersWithPrecision(text: string): ParsedNumber[] {
  const out: ParsedNumber[] = [];
  const parse = (t: string) => {
    const n = Number(t);
    return Number.isFinite(n) ? { value: n, decimals: t.includes(".") ? t.length - t.indexOf(".") - 1 : 0 } : null;
  };
  for (const m of text.matchAll(/-?\d[\d.,]*/g)) {
    const raw = m[0].replace(/[.,]$/, "");
    let t = raw;
    let alt: string | null = null;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
      t = raw.replace(/\./g, "").replace(",", ".");
      if (/^-?\d{1,3}\.\d{3}$/.test(raw)) alt = raw; // "1.234": milhar (pt-BR) ou decimal (en-US)
    } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
      t = raw.replace(/,/g, "");
      if (/^-?\d{1,3},\d{3}$/.test(raw)) alt = raw.replace(",", "."); // "119,260": milhar (en-US) ou decimal (pt-BR)
    } else t = raw.replace(",", ".");
    const main = parse(t);
    if (!main) continue;
    const a = alt ? parse(alt) : null;
    out.push(a ? { ...main, alt: a } : main);
  }
  return out;
}

export function numbersInText(text: string): number[] {
  return numbersWithPrecision(text).map((x) => x.value);
}

/**
 * Todo número do texto precisa existir no contexto, aceitando só o arredondamento da precisão escrita
 * (ex.: "73,9" casa com 73,86–73,94) ou 0,06% do valor (números grandes), inclusive em forma percentual
 * (0,0081 ↔ 0,81%), em mil, milhões ou bilhões. Inteiros de 0 a 10 são livres (contagens, "2 timeframes").
 * Devolve os números não encontrados.
 */
export function unknownNumbers(text: string, context: unknown): number[] {
  const allowed: number[] = [];
  collectNumbers(context, allowed);
  const variants = allowed.flatMap((n) => [n, n * 100, n / 1e3, n / 1e6, n / 1e9]).map(Math.abs);
  const match = ({ value, decimals }: { value: number; decimals: number }) => {
    if (Number.isInteger(value) && Math.abs(value) <= 10) return true;
    const x = Math.abs(value);
    const tolDigits = 0.5 * 10 ** -decimals + 1e-9;
    return variants.some((a) => Math.abs(a - x) <= Math.max(tolDigits, a * 0.0006));
  };
  const ok = (n: ParsedNumber) => match(n) || (n.alt != null && match(n.alt));
  return numbersWithPrecision(text)
    .filter((n) => !ok(n))
    .map((n) => n.value);
}

const llmSchema = z.object({ summary: z.string().min(10).max(900), risks: z.array(z.string().max(240)).max(5), watch: z.array(z.string().max(240)).max(5) });

export async function analyzeContext(c: MarketContext, opts: { question?: string; useLlm: boolean }): Promise<AnalystReply> {
  const { headline, sections } = deterministicBrief(c);
  const base: AnalystReply = {
    contextKey: c.contextKey,
    generatedAt: Date.now(),
    headline,
    sections,
    interpretation: null,
    guardrail: { llm: getLlmInfo().configured ? "not_requested" : "not_configured", detail: null },
    disclaimer: DISCLAIMER,
  };
  if (!opts.useLlm || !getLlmInfo().configured) return base;
  const ctx = compactContext(c);
  try {
    const out = await completeJson({
      system:
        "Você é um analista de mercado neutro do CryptoScanner. Use SOMENTE os números presentes no JSON CONTEXT; nunca calcule, estime ou invente preço, indicador, probabilidade ou alvo. " +
        "Não recomende comprar, vender ou alavancar; descreva estrutura, liquidez, confluência, setup, derivativos e riscos. Português do Brasil, técnico e direto, sem metáforas.",
      user: `CONTEXT:\n${JSON.stringify(ctx)}\n\nPERGUNTA: ${opts.question?.slice(0, 300) || "Resuma o contexto atual e os principais riscos."}\n\nResponda em JSON {"summary": string, "risks": string[], "watch": string[]}.`,
      schema: llmSchema,
      maxTokens: 900,
    });
    if (!out) return base;
    const bad = unknownNumbers([out.summary, ...out.risks, ...out.watch].join("\n"), ctx);
    if (bad.length) {
      log.warn("interpretação descartada por número fora do contexto", { contextKey: c.contextKey, bad: bad.slice(0, 5) });
      return { ...base, guardrail: { llm: "rejected", detail: `interpretação descartada: número(s) fora do contexto (${bad.slice(0, 3).join(", ")})` } };
    }
    return { ...base, interpretation: out, guardrail: { llm: "ok", detail: null } };
  } catch (err) {
    log.warn("LLM falhou", { error: (err as Error).message });
    return { ...base, guardrail: { llm: "error", detail: "interpretação indisponível no momento" } };
  }
}
