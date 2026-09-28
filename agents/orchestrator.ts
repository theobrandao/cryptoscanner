import { randomUUID } from "node:crypto";
import { z } from "zod";
import { marketAgent, type MarketOutput } from "@/agents/market-agent";
import { riskAgent, type RiskOutput } from "@/agents/risk-agent";
import { runAgent, type ToolMap } from "@/agents/runtime";
import { symbolSchema, timeframeSchema } from "@/agents/schemas";
import { sentimentAgent, type SentimentOutput } from "@/agents/sentiment-agent";
import { technicalAnalysisAgent, type TaOutput } from "@/agents/technical-analysis-agent";
import type { LlmTools } from "@/agents/tools";
import { trendAgent, type TrendOutput } from "@/agents/trend-agent";
import type { AgentRunResult } from "@/agents/types";
import { round } from "@/lib/indicators/core";
import type { Direction } from "@/types/market";

/**
 * ORCHESTRATOR
 * Executa o pipeline market → (technical, trend, risk, sentiment) e consolida:
 * detecta conflitos, compara evidências, identifica ausência de dados, calcula métricas derivadas
 * e devolve um resultado estruturado. Não concatena respostas: cada evidência tem peso e origem.
 */
export const orchestratorInputSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema.default("4h"),
  includeSentiment: z.boolean().default(true),
  useLlm: z.boolean().default(true),
  minPatternConfidence: z.number().min(0).max(100).default(60),
});

export type OrchestratorInput = z.infer<typeof orchestratorInputSchema>;

export interface Evidence {
  agent: string;
  key: string;
  direction: Direction;
  weight: number;
  confidence: number;
  detail: string;
}

export interface Conflict {
  code: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface OrchestratorResult {
  executionId: string;
  symbol: string;
  timeframe: string;
  executedAt: number;
  durationMs: number;
  verdict: Direction;
  /** -1..1 ponderação das evidências */
  score: number;
  /** score atenuado pelo risco (0..1 de atenuação) */
  riskAdjustedScore: number;
  /** 0..100 */
  confidence: number;
  riskLevel: RiskOutput["riskLevel"] | "unknown";
  conflicts: Conflict[];
  missingData: string[];
  evidence: Evidence[];
  keyLevels: {
    price: number | null;
    support: number | null;
    resistance: number | null;
    suggestedStopPct: number | null;
    patternTarget: number | null;
    patternStop: number | null;
  };
  agents: Record<string, { status: AgentRunResult<unknown>["status"]; durationMs: number; error?: string }>;
  outputs: {
    market: MarketOutput | null;
    technical: TaOutput | null;
    trend: TrendOutput | null;
    risk: RiskOutput | null;
    sentiment: SentimentOutput | null;
  };
  narrative: string;
  llmNarrative: string | null;
  disclaimer: string;
}

export const DISCLAIMER = "Conteúdo informativo e educacional gerado por algoritmos. Não constitui recomendação de investimento; criptoativos envolvem risco elevado, inclusive de perda total.";

export interface OrchestratorOptions {
  tools: ToolMap;
  executionId?: string;
  now?: number;
  signal?: AbortSignal;
  /** callback para persistência/telemetria de cada agente */
  onAgentResult?: (result: AgentRunResult<unknown>) => void | Promise<void>;
}

const llmNarrativeSchema = z.object({ narrative: z.string().min(20).max(1200) });

export async function orchestrate(rawInput: unknown, options: OrchestratorOptions): Promise<OrchestratorResult> {
  const input = orchestratorInputSchema.parse(rawInput);
  const executionId = options.executionId ?? randomUUID();
  const now = options.now ?? Date.now();
  const t0 = Date.now();
  const base = { tools: options.tools, executionId, now, signal: options.signal };
  const agents: OrchestratorResult["agents"] = {};
  const record = async <O>(r: AgentRunResult<O>) => {
    agents[r.agent] = { status: r.status, durationMs: r.durationMs, error: r.error };
    await options.onAgentResult?.(r as AgentRunResult<unknown>);
    return r;
  };

  // 1) Dados de mercado
  const market = await record(await runAgent(marketAgent, { symbol: input.symbol, timeframe: input.timeframe, limit: 300 }, base));
  const missingData: string[] = [];
  if (!market.output) {
    return finalize({
      executionId,
      input,
      t0,
      now,
      agents,
      missingData: ["candles: nenhum provedor respondeu"],
      outputs: { market: null, technical: null, trend: null, risk: null, sentiment: null },
    });
  }
  const m = market.output;
  if (m.provenance.stale) missingData.push(`candles obsoletos (fonte ${m.provenance.source}, coleta ${new Date(m.provenance.asOf).toISOString()})`);
  if (!m.ticker) missingData.push("ticker 24h indisponível");
  if (!m.quality.sufficientForIndicators) missingData.push(`apenas ${m.quality.candles} candles (mínimo 60 para EMAs longas)`);
  if (m.quality.gaps > 0) missingData.push(`${m.quality.gaps} lacuna(s) na série`);

  // 2) Agentes analíticos em paralelo
  const common = { symbol: input.symbol, timeframe: input.timeframe, candles: m.candles };
  const [technical, trend, risk, sentiment] = await Promise.all([
    runAgent(technicalAnalysisAgent, { ...common, minPatternConfidence: input.minPatternConfidence }, base).then(record),
    runAgent(trendAgent, common, base).then(record),
    runAgent(riskAgent, { ...common, ticker: m.ticker }, base).then(record),
    input.includeSentiment ? runAgent(sentimentAgent, { symbol: input.symbol, useLlm: input.useLlm }, base).then(record) : Promise.resolve(null),
  ]);

  if (!technical.output) missingData.push("análise técnica falhou");
  if (!trend.output) missingData.push("tendência falhou");
  else if (!trend.output.higher) missingData.push("timeframe superior indisponível");
  if (!risk.output) missingData.push("risco falhou");
  if (input.includeSentiment) {
    if (!sentiment?.output) missingData.push("sentimento falhou");
    else {
      if (!sentiment.output.fearGreed) missingData.push("índice Medo & Ganância indisponível");
      if (sentiment.output.news.length === 0) missingData.push("sem manchetes recentes");
    }
  }

  const result = finalize({
    executionId,
    input,
    t0,
    now,
    agents,
    missingData,
    outputs: {
      market: m,
      technical: technical.output,
      trend: trend.output,
      risk: risk.output,
      sentiment: sentiment?.output ?? null,
    },
  });

  // 3) Narrativa opcional por LLM (interpretação; nunca altera números)
  if (input.useLlm) {
    try {
      const llm = (options.tools.llm as LlmTools | undefined) ?? null;
      if (llm?.info().configured) {
        const out = await llm.completeJson({
          system:
            "Você é um analista técnico. Escreva, em português do Brasil, um parágrafo objetivo (máx. 120 palavras) interpretando os dados fornecidos. Não invente números; não prometa resultados; cite conflitos e dados ausentes.",
          user: JSON.stringify({
            symbol: result.symbol,
            timeframe: result.timeframe,
            verdict: result.verdict,
            score: result.score,
            confidence: result.confidence,
            riskLevel: result.riskLevel,
            evidence: result.evidence.map((e) => `${e.agent}/${e.key}: ${e.direction} (${e.detail})`),
            conflicts: result.conflicts.map((c) => c.description),
            missingData: result.missingData,
          }),
          schema: llmNarrativeSchema,
          maxTokens: 400,
          signal: options.signal,
        });
        result.llmNarrative = out?.narrative ?? null;
      }
    } catch {
      result.llmNarrative = null;
    }
  }
  return result;
}

interface FinalizeArgs {
  executionId: string;
  input: OrchestratorInput;
  t0: number;
  now: number;
  agents: OrchestratorResult["agents"];
  missingData: string[];
  outputs: OrchestratorResult["outputs"];
}

export function finalize(args: FinalizeArgs): OrchestratorResult {
  const { outputs, missingData } = args;
  const evidence: Evidence[] = [];
  const conflicts: Conflict[] = [];

  const ta = outputs.technical;
  const tr = outputs.trend;
  const rk = outputs.risk;
  const st = outputs.sentiment;

  // ---- Evidências ponderadas
  if (ta) {
    evidence.push({
      agent: "technical-analysis-agent",
      key: "bias",
      direction: ta.bias,
      weight: 0.45,
      confidence: ta.confidence,
      detail: `score ${ta.confidence}/100 com ${ta.signals.length} sinais`,
    });
    const top = ta.patterns[0];
    if (top)
      evidence.push({ agent: "technical-analysis-agent", key: `pattern:${top.key}`, direction: top.direction, weight: 0.15, confidence: top.confidence, detail: `${top.label} (${top.confidence})` });
  }
  if (tr) {
    evidence.push({
      agent: "trend-agent",
      key: "overall",
      direction: tr.overall,
      weight: 0.3,
      confidence: tr.confidence,
      detail: `${tr.primary.timeframe} ${tr.primary.trend}${tr.higher ? ` / ${tr.higher.timeframe} ${tr.higher.trend}` : ""} (${tr.alignment})`,
    });
  }
  if (st) {
    const dir: Direction = st.overall === "positive" ? "bullish" : st.overall === "negative" ? "bearish" : "neutral";
    evidence.push({ agent: "sentiment-agent", key: "overall", direction: dir, weight: 0.15, confidence: st.confidence, detail: st.explanation });
  }

  // ---- Conflitos
  if (ta && tr && ta.bias !== "neutral" && tr.overall !== "neutral" && ta.bias !== tr.overall) {
    conflicts.push({ code: "ta_vs_trend", severity: "high", description: `Sinais técnicos (${ta.bias}) contrariam a tendência consolidada (${tr.overall}).` });
  }
  if (tr && tr.alignment === "conflicting") {
    conflicts.push({
      code: "timeframe_conflict",
      severity: "medium",
      description: `Tendência ${tr.primary.timeframe} (${tr.primary.trend}) oposta à do ${tr.higher?.timeframe} (${tr.higher?.trend}).`,
    });
  }
  if (ta) {
    const dirs = new Set(ta.patterns.map((p) => p.direction).filter((d) => d !== "neutral"));
    if (dirs.size > 1) conflicts.push({ code: "pattern_conflict", severity: "medium", description: `Padrões de direções opostas detectados: ${ta.patterns.map((p) => p.label).join(", ")}.` });
    const sigDirs = ta.signals.filter((s) => s.direction !== "neutral");
    const bull = sigDirs.filter((s) => s.direction === "bullish").reduce((a, s) => a + s.weight, 0);
    const bear = sigDirs.filter((s) => s.direction === "bearish").reduce((a, s) => a + s.weight, 0);
    if (bull > 0 && bear > 0 && Math.abs(bull - bear) / (bull + bear) < 0.25) {
      conflicts.push({ code: "mixed_signals", severity: "low", description: `Sinais divididos (${bull} de alta × ${bear} de baixa em peso).` });
    }
  }
  if (st && ta && ta.bias !== "neutral") {
    const sDir = st.overall === "positive" ? "bullish" : st.overall === "negative" ? "bearish" : "neutral";
    if (sDir !== "neutral" && sDir !== ta.bias) conflicts.push({ code: "sentiment_vs_ta", severity: "low", description: `Sentimento ${st.overall} diverge do viés técnico ${ta.bias}.` });
  }
  if (rk && (rk.riskLevel === "extreme" || rk.riskLevel === "high") && ta && ta.confidence >= 60) {
    conflicts.push({
      code: "high_risk_high_confidence",
      severity: "medium",
      description: `Confiança técnica ${ta.confidence} com risco ${rk.riskLevel} (ATR ${rk.atrPct}%): tamanho de posição e stop precisam refletir a volatilidade.`,
    });
  }

  // ---- Métricas derivadas
  let num = 0;
  let den = 0;
  let confNum = 0;
  for (const e of evidence) {
    const v = e.direction === "bullish" ? 1 : e.direction === "bearish" ? -1 : 0;
    const w = e.weight * (0.5 + e.confidence / 200); // confiança modula o peso
    num += v * w;
    den += e.weight;
    confNum += e.weight * e.confidence;
  }
  const score = den > 0 ? round(num / den, 3) : 0;
  let confidence = den > 0 ? confNum / den : 0;
  confidence -= conflicts.reduce((s, c) => s + (c.severity === "high" ? 20 : c.severity === "medium" ? 10 : 5), 0);
  confidence -= Math.min(30, missingData.length * 6);
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));
  const riskFactor = rk ? 1 - rk.riskScore / 200 : 0.75;
  const riskAdjustedScore = round(score * riskFactor, 3);
  const verdict: Direction = score > 0.2 ? "bullish" : score < -0.2 ? "bearish" : "neutral";

  const topPattern = ta?.patterns[0] ?? null;
  const keyLevels = {
    price: ta?.indicators.price ?? outputs.market?.ticker?.price ?? null,
    support: ta?.support[0] ?? null,
    resistance: ta?.resistance[0] ?? null,
    suggestedStopPct: rk && Number.isFinite(rk.suggestedStopPct) ? rk.suggestedStopPct : null,
    patternTarget: topPattern?.target ?? null,
    patternStop: topPattern?.stop ?? null,
  };

  const parts: string[] = [];
  parts.push(`Veredito ${ptDir(verdict)} para ${args.input.symbol} em ${args.input.timeframe} (score ${score}, ajustado ao risco ${riskAdjustedScore}, confiança ${confidence}/100).`);
  if (ta) parts.push(ta.explanation);
  if (tr) parts.push(tr.explanation);
  if (rk) parts.push(`Risco ${rk.riskLevel} (${rk.riskScore}/100): ATR ${rk.atrPct}%, liquidez ${rk.liquidity.tier}, stop sugerido ${rk.suggestedStopPct}%.`);
  if (st) parts.push(st.explanation);
  if (conflicts.length) parts.push(`Conflitos: ${conflicts.map((c) => c.description).join(" ")}`);
  if (missingData.length) parts.push(`Dados ausentes: ${missingData.join("; ")}.`);

  return {
    executionId: args.executionId,
    symbol: args.input.symbol,
    timeframe: args.input.timeframe,
    executedAt: args.now,
    durationMs: Date.now() - args.t0,
    verdict,
    score,
    riskAdjustedScore,
    confidence,
    riskLevel: rk?.riskLevel ?? "unknown",
    conflicts,
    missingData,
    evidence,
    keyLevels,
    agents: args.agents,
    outputs,
    narrative: parts.join(" "),
    llmNarrative: null,
    disclaimer: DISCLAIMER,
  };
}

function ptDir(d: Direction) {
  return d === "bullish" ? "de alta" : d === "bearish" ? "de baixa" : "neutro";
}

export const AGENT_DEFINITIONS = [marketAgent, technicalAnalysisAgent, trendAgent, riskAgent, sentimentAgent] as const;
