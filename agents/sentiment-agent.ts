import { z } from "zod";
import { defineAgent } from "@/agents/runtime";
import { symbolSchema } from "@/agents/schemas";
import type { LlmTools, SentimentTools } from "@/agents/tools";
import { round } from "@/lib/indicators/core";

/**
 * SENTIMENT AGENT
 * Fontes públicas: índice Medo & Ganância (alternative.me) e manchetes RSS (Cointelegraph, CoinDesk).
 * Pontuação determinística por léxico; opcionalmente o LLM reclassifica as manchetes.
 * Toda saída carrega fonte e data.
 */
export const sentimentInputSchema = z.object({
  symbol: symbolSchema,
  useLlm: z.boolean().default(true),
});

const newsOutSchema = z.object({
  title: z.string(),
  link: z.string(),
  source: z.string(),
  publishedAt: z.number(),
  score: z.number().nullable(),
  matchedTerms: z.array(z.string()),
});

export const sentimentOutputSchema = z.object({
  symbol: z.string(),
  fearGreed: z
    .object({
      value: z.number(),
      classification: z.string(),
      classificationPt: z.string(),
      timestamp: z.number(),
      source: z.string(),
      stale: z.boolean(),
    })
    .nullable(),
  news: z.array(newsOutSchema),
  newsScore: z.number().nullable(),
  newsMethod: z.enum(["lexicon", "llm", "none"]),
  overall: z.enum(["positive", "neutral", "negative"]),
  /** 0..100 — quantidade e concordância das evidências */
  confidence: z.number().min(0).max(100),
  sources: z.array(z.object({ name: z.string(), asOf: z.number(), stale: z.boolean() })),
  explanation: z.string(),
});

export type SentimentInput = z.infer<typeof sentimentInputSchema>;
export type SentimentOutput = z.infer<typeof sentimentOutputSchema>;

const llmSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), score: z.number().min(-1).max(1) })),
});

export const sentimentAgent = defineAgent<SentimentInput, SentimentOutput>({
  name: "sentiment-agent",
  purpose: "Consolidar sentimento de mercado a partir de fontes públicas, sempre com origem e data.",
  inputs: ["symbol", "useLlm"],
  outputs: ["fearGreed", "news", "newsScore", "newsMethod", "overall", "confidence", "sources", "explanation"],
  allowedTools: ["sentiment", "llm"],
  rules: ["Nunca apresentar sentimento sem fonte e data.", "LLM só reclassifica manchetes já coletadas; não gera notícias.", "Fonte indisponível reduz a confiança em vez de interromper a análise."],
  timeoutMs: 20_000,
  inputSchema: sentimentInputSchema,
  outputSchema: sentimentOutputSchema,

  async run(input, ctx) {
    const sentiment = ctx.tools.use<SentimentTools>("sentiment");
    const llm = ctx.tools.use<LlmTools>("llm");
    const sources: SentimentOutput["sources"] = [];

    let fearGreed: SentimentOutput["fearGreed"] = null;
    try {
      const fg = await sentiment.fearGreed();
      fearGreed = { ...fg.data, stale: fg.stale };
      sources.push({ name: fg.data.source, asOf: fg.data.timestamp, stale: fg.stale });
    } catch (err) {
      ctx.log("warn", "medo & ganância indisponível", { error: (err as Error).message });
    }

    let news: SentimentOutput["news"] = [];
    let newsMethod: SentimentOutput["newsMethod"] = "none";
    try {
      const res = await sentiment.news(input.symbol);
      news = res.items.map((n) => ({ title: n.title, link: n.link, source: n.source, publishedAt: n.publishedAt, score: n.score, matchedTerms: n.matchedTerms }));
      newsMethod = "lexicon";
      const hosts = [...new Set(news.map((n) => n.source))];
      for (const h of hosts) sources.push({ name: `rss:${h}`, asOf: res.fetchedAt, stale: res.stale });
    } catch (err) {
      ctx.log("warn", "notícias indisponíveis", { error: (err as Error).message });
    }

    if (input.useLlm && news.length && llm.info().configured) {
      try {
        const out = await llm.completeJson({
          system: "Você classifica manchetes de criptomoedas. Para cada manchete devolva um score entre -1 (muito negativo para o preço do ativo) e 1 (muito positivo). Não invente manchetes.",
          user: `Ativo: ${input.symbol}. Manchetes:\n${news.map((n, i) => `${i}. ${n.title}`).join("\n")}\n\nFormato: {"items":[{"index":0,"score":0.2}]}`,
          schema: llmSchema,
          maxTokens: 600,
          signal: ctx.signal,
        });
        if (out) {
          for (const it of out.items) {
            const n = news[it.index];
            if (n) n.score = round(it.score, 2);
          }
          newsMethod = "llm";
        }
      } catch (err) {
        ctx.log("warn", "LLM falhou; mantendo léxico", { error: (err as Error).message });
      }
    }

    const scored = news.filter((n) => n.score !== null);
    const newsScore = scored.length ? round(scored.reduce((s, n) => s + (n.score ?? 0), 0) / scored.length, 3) : null;

    // Combinação: F&G normalizado (-1..1) com peso 0.5; notícias com peso 0.5 (quando existem).
    let composite = 0;
    let weight = 0;
    if (fearGreed) {
      composite += ((fearGreed.value - 50) / 50) * 0.5;
      weight += 0.5;
    }
    if (newsScore !== null) {
      composite += newsScore * 0.5;
      weight += 0.5;
    }
    const value = weight > 0 ? composite / weight : 0;
    const overall = value > 0.15 ? "positive" : value < -0.15 ? "negative" : "neutral";
    const confidence = Math.round(Math.min(100, (weight * 60 + Math.min(scored.length, 8) * 5) * (0.5 + Math.abs(value) / 2)));
    const explanation =
      (fearGreed ? `Medo & Ganância ${fearGreed.value} (${fearGreed.classificationPt}, ${new Date(fearGreed.timestamp).toISOString().slice(0, 10)}). ` : "Índice Medo & Ganância indisponível. ") +
      (newsScore !== null ? `${scored.length} de ${news.length} manchetes pontuadas (${newsMethod}), média ${newsScore}.` : "Sem manchetes pontuáveis.");
    ctx.log("info", "sentimento consolidado", { overall, confidence, newsMethod });
    return { symbol: input.symbol, fearGreed, news, newsScore, newsMethod, overall, confidence, sources, explanation };
  },

  fallback(input) {
    return {
      symbol: input.symbol,
      fearGreed: null,
      news: [],
      newsScore: null,
      newsMethod: "none",
      overall: "neutral",
      confidence: 0,
      sources: [],
      explanation: "Fallback: nenhuma fonte de sentimento respondeu a tempo.",
    };
  },
});
