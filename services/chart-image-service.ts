import { createHash } from "node:crypto";
import { z } from "zod";
import { DISCLAIMER } from "@/agents/orchestrator";
import { getPrisma } from "@/database/client";
import { isLlmConfigured } from "@/lib/env";
import { round } from "@/lib/indicators/core";
import { PLANS, type PlanKey } from "@/lib/plans";
import { completeJson, getLlmInfo } from "@/services/llm";

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
  constructor() {
    super("Análise de imagem indisponível: nenhum provedor de IA com visão está configurado (LLM_PROVIDER/ANTHROPIC_API_KEY).");
    this.name = "ChartAnalysisUnavailableError";
  }
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
  if (!isLlmConfigured()) throw new ChartAnalysisUnavailableError();
  if (input.bytes.length > MAX_IMAGE_BYTES) throw new Error("Imagem acima de 5 MB");
  const limit = PLANS[input.plan].imageAnalysesPerDay;
  if (Number.isFinite(limit)) {
    const used = await countTodayAnalyses(input.userId);
    if (used >= limit) throw new QuotaExceededError(limit);
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
