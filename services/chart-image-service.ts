import { createHash } from "node:crypto";
import { z } from "zod";
import { DISCLAIMER } from "@/agents/orchestrator";
import { getPrisma } from "@/database/client";
import { isLlmConfigured } from "@/lib/env";
import { round } from "@/lib/indicators/core";
import { PLANS, type PlanKey } from "@/lib/plans";
import { completeJson, getLlmInfo } from "@/services/llm";
import { analyzeAsset } from "@/services/analysis-service";
import { getAsset } from "@/lib/assets";
import type { Timeframe } from "@/types/market";

/**
 * Análise de gráfico por IA a partir de imagem (JPG/PNG/WebP até 5 MB).
 * REIMPLEMENTAÇÃO NECESSÁRIA: a referência usa um serviço privado; aqui usamos o provedor LLM
 * configurado (visão), com saída validada por schema. Potencial/risco/relação são recalculados
 * programaticamente a partir de entrada/alvo/stop — nunca aceitos do modelo.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

const llmOutputSchema = z.object({
  asset: z.string().nullable(),
  timeframe: z.string().nullable(),
  trend: z.enum(["bullish", "bearish", "neutral"]),
  patterns: z.array(z.string()).max(6),
  entry: z.number().positive().nullable(),
  target: z.number().positive().nullable(),
  stopLoss: z.number().positive().nullable(),
  confidence: z.number().min(0).max(100),
  insights: z.array(z.string().min(3).max(300)).min(1).max(8),
  readability: z.enum(["good", "partial", "poor"]),
});

export interface ChartImageAnalysis {
  id: string | null;
  provider: string;
  model: string;
  asset: string | null;
  timeframe: string | null;
  trend: "bullish" | "bearish" | "neutral";
  patterns: string[];
  confidence: number;
  points: { entry: number | null; target: number | null; stopLoss: number | null };
  riskReward: { potentialPct: number | null; riskPct: number | null; ratio: number | null };
  insights: string[];
  readability: "good" | "partial" | "poor";
  disclaimer: string;
  createdAt: number;
}

export class ChartAnalysisUnavailableError extends Error {
  constructor(message = "Análise de imagem indisponível: nenhum provedor de IA com visão está configurado (LLM_PROVIDER/ANTHROPIC_API_KEY).") {
    super(message);
    this.name = "ChartAnalysisUnavailableError";
  }
}

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"];

/**
 * Modo determinístico (sem provedor de visão): a imagem é registrada (hash) e a leitura técnica é feita
 * sobre os dados reais do ativo/timeframe informados pelo usuário, via orquestrador multiagente.
 * A saída tem o mesmo formato da análise por imagem e declara explicitamente que a imagem não foi interpretada.
 */
async function analyzeDeterministic(symbol: string, timeframe: Timeframe): Promise<Omit<ChartImageAnalysis, "id" | "createdAt" | "disclaimer">> {
  const r = await analyzeAsset({ symbol, timeframe, includeSentiment: true, useLlm: false, trigger: "api" });
  const ta = r.outputs.technical;
  const price = r.keyLevels.price;
  const bullish = r.verdict === "bullish";
  const bearish = r.verdict === "bearish";
  const target = r.keyLevels.patternTarget ?? (bullish ? r.keyLevels.resistance : bearish ? r.keyLevels.support : null);
  const stop = r.keyLevels.patternStop ?? (price && r.keyLevels.suggestedStopPct ? round(price * (1 - (bullish ? 1 : -1) * (r.keyLevels.suggestedStopPct / 100)), 8) : null);
  const patterns = (ta?.patterns ?? []).slice(0, 4).map((p) => `${p.label} (${p.confidence}%)`);
  const insights: string[] = [];
  insights.push(`Leitura feita sobre os candles reais de ${symbol} em ${timeframe.toUpperCase()} (fonte ${r.outputs.market?.provenance?.source ?? "mercado"}), não sobre a imagem enviada — o servidor não tem provedor de visão configurado.`);
  insights.push(r.narrative);
  for (const e of r.evidence.slice(0, 4)) insights.push(`${e.agent.replace("-agent", "")}: ${e.detail}`);
  for (const c of r.conflicts.slice(0, 2)) insights.push(`Conflito: ${c.description}`);
  if (r.missingData.length) insights.push(`Dados ausentes: ${r.missingData.join(", ")}.`);
  return {
    provider: "deterministic",
    model: "orchestrator",
    asset: symbol,
    timeframe,
    trend: r.verdict,
    patterns,
    confidence: Math.round(r.confidence),
    points: { entry: price, target, stopLoss: stop },
    riskReward: computeRiskReward(price, target, stop),
    insights: insights.slice(0, 8),
    readability: "partial",
  };
}

export class QuotaExceededError extends Error {
  constructor(limit: number) {
    super(`Limite diário de ${limit} análises de IA do seu plano atingido.`);
    this.name = "QuotaExceededError";
  }
}

export function computeRiskReward(entry: number | null, target: number | null, stop: number | null) {
  if (!entry || !target || !stop) return { potentialPct: null, riskPct: null, ratio: null };
  const potentialPct = round(((target - entry) / entry) * 100, 2);
  const riskPct = round(((entry - stop) / entry) * 100, 2);
  const ratio = riskPct !== 0 ? round(Math.abs(potentialPct) / Math.abs(riskPct), 2) : null;
  return { potentialPct, riskPct, ratio };
}

export async function countTodayAnalyses(userId: string): Promise<number> {
  const prisma = getPrisma();
  if (!prisma) return 0;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return prisma.chartAnalysis.count({ where: { userId, createdAt: { gte: start } } });
}

export async function analyzeChartImage(input: {
  userId: string;
  plan: PlanKey;
  bytes: Buffer;
  mime: AllowedMime;
  hint?: { symbol?: string; timeframe?: string };
  signal?: AbortSignal;
}): Promise<ChartImageAnalysis> {
  if (input.bytes.length > MAX_IMAGE_BYTES) throw new Error("Imagem acima de 5 MB");
  const limit = PLANS[input.plan].imageAnalysesPerDay;
  if (Number.isFinite(limit)) {
    const used = await countTodayAnalyses(input.userId);
    if (used >= limit) throw new QuotaExceededError(limit);
  }

  if (!isLlmConfigured()) {
    const symbol = input.hint?.symbol?.toUpperCase();
    const tf = (input.hint?.timeframe ?? "4h").toLowerCase() as Timeframe;
    if (!symbol || !getAsset(symbol)) throw new ChartAnalysisUnavailableError("Sem provedor de visão neste servidor: informe o ativo (um dos 20 do scanner) para a leitura técnica ser feita sobre os dados reais.");
    if (!TIMEFRAMES.includes(tf)) throw new ChartAnalysisUnavailableError("Timeframe inválido; use 15m, 30m, 1h, 4h, 1d ou 1w.");
    const det = await analyzeDeterministic(symbol, tf);
    const analysis: ChartImageAnalysis = { id: null, ...det, disclaimer: DISCLAIMER, createdAt: Date.now() };
    const prisma = getPrisma();
    if (prisma) {
      const saved = await prisma.chartAnalysis.create({
        data: { userId: input.userId, symbol, timeframe: tf, imageSha256: createHash("sha256").update(input.bytes).digest("hex"), imageMime: input.mime, provider: "deterministic", model: "orchestrator", result: JSON.parse(JSON.stringify(analysis)) },
      });
      analysis.id = saved.id;
    }
    return analysis;
  }

  const out = await completeJson({
    system:
      "Você é um analista técnico de criptomoedas. Analise a imagem de um gráfico de preços e devolva JSON com: asset (ticker se legível ou null), timeframe (se legível ou null), trend (bullish|bearish|neutral), patterns (nomes de padrões visíveis), entry/target/stopLoss (níveis de preço legíveis no eixo; null se não legíveis), confidence (0-100, coerência da leitura), insights (3 a 6 frases objetivas em português do Brasil), readability (good|partial|poor). Não invente preços que não estejam visíveis. Não prometa resultados.",
    user: `Contexto opcional: ativo ${input.hint?.symbol ?? "desconhecido"}, timeframe ${input.hint?.timeframe ?? "desconhecido"}. Responda apenas com o JSON.`,
    schema: llmOutputSchema,
    image: { mediaType: input.mime, base64: input.bytes.toString("base64") },
    maxTokens: 900,
    signal: input.signal,
  });
  if (!out) throw new ChartAnalysisUnavailableError();

  const rr = computeRiskReward(out.entry, out.target, out.stopLoss);
  const info = getLlmInfo();
  const analysis: ChartImageAnalysis = {
    id: null,
    provider: info.provider,
    model: info.model,
    asset: out.asset,
    timeframe: out.timeframe,
    trend: out.trend,
    patterns: out.patterns,
    confidence: Math.round(out.confidence),
    points: { entry: out.entry, target: out.target, stopLoss: out.stopLoss },
    riskReward: rr,
    insights: out.insights,
    readability: out.readability,
    disclaimer: DISCLAIMER,
    createdAt: Date.now(),
  };

  const prisma = getPrisma();
  if (prisma) {
    const saved = await prisma.chartAnalysis.create({
      data: {
        userId: input.userId,
        symbol: analysis.asset,
        timeframe: analysis.timeframe,
        imageSha256: createHash("sha256").update(input.bytes).digest("hex"),
        imageMime: input.mime,
        provider: analysis.provider,
        model: analysis.model,
        result: JSON.parse(JSON.stringify(analysis)),
      },
    });
    analysis.id = saved.id;
  }
  return analysis;
}
