import { z } from "zod";

/**
 * Strategy Builder — definição declarativa de uma estratégia. Cada condição tem seu PRÓPRIO timeframe
 * (multi-timeframe nativo): "1D trend = bullish AND 4H RSI < 40 AND 1H last_event = BOS_bullish".
 * A mesma definição roda no scanner (universo), no monitor (servidor) e no backtest (histórico causal).
 */

export const STRATEGY_TFS = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
export type StrategyTf = (typeof STRATEGY_TFS)[number];

export type FeatureKind = "number" | "enum" | "boolean";

export interface FeatureSpec {
  key: string;
  label: string;
  kind: FeatureKind;
  /** valores possíveis (enum) */
  options?: readonly string[];
  /** faixa sugerida (number) */
  min?: number;
  max?: number;
  unit?: string;
  hint: string;
  /** só existe ao vivo (não reconstruível no histórico) — backtest recusa */
  liveOnly?: boolean;
  /** só para perpétuos */
  perpOnly?: boolean;
}

export const FEATURES = [
  { key: "trend", label: "Estrutura (tendência externa)", kind: "enum", options: ["bullish", "bearish", "neutral"], hint: "HH/HL = bullish, LH/LL = bearish (pivôs k=5, filtro 1,5 ATR)" },
  { key: "regime", label: "Regime de mercado", kind: "enum", options: ["Bull Trend", "Bear Trend", "Range", "Expansion", "Compression", "High Volatility"], hint: "classificação por estrutura, EMAs e percentil do ATR" },
  { key: "last_event", label: "Último evento de estrutura", kind: "enum", options: ["BOS_bullish", "BOS_bearish", "CHoCH_bullish", "CHoCH_bearish", "MSS_bullish", "MSS_bearish", "none"], hint: "evento externo mais recente (fechamento além do swing)" },
  { key: "bars_since_event", label: "Candles desde o último evento", kind: "number", min: 0, max: 200, hint: "0 = evento no último candle fechado" },
  { key: "ema_score", label: "EMA score", kind: "number", min: -100, max: 100, hint: "ordem preço/EMA21/50/200 + inclinação da EMA50" },
  { key: "above_ema50", label: "Fechamento acima da EMA 50", kind: "boolean", hint: "último candle fechado" },
  { key: "above_ema200", label: "Fechamento acima da EMA 200", kind: "boolean", hint: "último candle fechado" },
  { key: "rsi", label: "RSI 14", kind: "number", min: 0, max: 100, hint: "Wilder, candles fechados" },
  { key: "rsi_slope", label: "Inclinação do RSI (3 candles)", kind: "number", min: -50, max: 50, hint: "RSI atual − RSI de 3 candles atrás" },
  { key: "macd_hist", label: "Histograma MACD", kind: "number", hint: "MACD 12/26/9; > 0 = momentum altista" },
  { key: "macd_rising", label: "Histograma MACD subindo", kind: "boolean", hint: "histograma atual > anterior" },
  { key: "atr_pct", label: "ATR % do preço", kind: "number", min: 0, max: 30, unit: "%", hint: "ATR 14 ÷ fechamento" },
  { key: "atr_percentile", label: "Percentil do ATR% (100 candles)", kind: "number", min: 0, max: 100, hint: "0 = volatilidade mínima do recorte" },
  { key: "bb_position", label: "Posição nas Bandas de Bollinger", kind: "number", min: 0, max: 1, hint: "0 = banda inferior, 1 = banda superior" },
  { key: "rvol", label: "Volume relativo (RVOL)", kind: "number", min: 0, max: 10, unit: "×", hint: "volume do candle ÷ média de 20" },
  { key: "range_position", label: "Posição na faixa (0 = fundo, 1 = topo)", kind: "number", min: 0, max: 1, hint: "entre o último swing alto e baixo externos" },
  { key: "sweep", label: "Varredura de liquidez recente (5 candles)", kind: "enum", options: ["bullish", "bearish", "none"], hint: "varreu SSL e voltou = bullish; varreu BSL e voltou = bearish" },
  { key: "divergence", label: "Divergência de RSI (15 candles)", kind: "enum", options: ["regular_bullish", "regular_bearish", "hidden_bullish", "hidden_bearish", "none"], hint: "pivôs confirmados (k=3)" },
  { key: "change_pct", label: "Variação do candle (%)", kind: "number", min: -50, max: 50, unit: "%", hint: "fechamento vs. fechamento anterior" },
  { key: "confluence_score", label: "Confluence Score", kind: "number", min: 0, max: 100, hint: "nota R2 do contexto completo", liveOnly: true },
  { key: "setup_state", label: "Estado do setup", kind: "enum", options: ["DETECTED", "FORMING", "READY", "TRIGGERED", "ACTIVE", "TARGET_HIT", "INVALIDATED", "EXPIRED", "NONE"], hint: "máquina de estados do setup", liveOnly: true },
  { key: "funding_rate", label: "Funding rate (%)", kind: "number", min: -1, max: 1, unit: "%", hint: "perpétuo da exchange selecionada", liveOnly: true, perpOnly: true },
  { key: "oi_change_24h", label: "Variação do OI em 24h (%)", kind: "number", min: -100, max: 100, unit: "%", hint: "perpétuo da exchange selecionada", liveOnly: true, perpOnly: true },
] as const satisfies readonly FeatureSpec[];

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_KEYS = FEATURES.map((f) => f.key) as [FeatureKey, ...FeatureKey[]];
export const featureSpec = (k: string): FeatureSpec | undefined => (FEATURES as readonly FeatureSpec[]).find((f) => f.key === k);

export const OPS = [">", ">=", "<", "<=", "==", "!="] as const;
export type Op = (typeof OPS)[number];

export const conditionSchema = z
  .object({
    tf: z.enum(STRATEGY_TFS),
    feature: z.enum(FEATURE_KEYS),
    op: z.enum(OPS),
    value: z.union([z.number().finite(), z.string().max(40), z.boolean()]),
  })
  .superRefine((c, ctx) => {
    const spec = featureSpec(c.feature);
    if (!spec) return;
    if (spec.kind === "number" && typeof c.value !== "number") ctx.addIssue({ code: "custom", message: `${spec.label}: valor numérico` });
    if (spec.kind === "boolean" && typeof c.value !== "boolean") ctx.addIssue({ code: "custom", message: `${spec.label}: verdadeiro/falso` });
    if (spec.kind === "enum" && (typeof c.value !== "string" || !spec.options?.includes(c.value))) ctx.addIssue({ code: "custom", message: `${spec.label}: valor fora da lista` });
    if (spec.kind !== "number" && c.op !== "==" && c.op !== "!=") ctx.addIssue({ code: "custom", message: `${spec.label}: use = ou ≠` });
  });

export type Condition = z.infer<typeof conditionSchema>;

export const groupSchema = z.object({
  logic: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(conditionSchema).min(1).max(12),
});

export const exitSchema = z.object({
  stop: z.enum(["structure", "atr"]).default("atr"),
  atrMult: z.number().min(0.3).max(10).default(1.5),
  rr: z.number().min(0.5).max(10).default(2),
  /** candles até encerrar pelo fechamento */
  horizon: z.number().int().min(5).max(300).default(60),
});

export const definitionSchema = z.object({
  version: z.literal(1).default(1),
  direction: z.enum(["long", "short"]),
  logic: z.enum(["AND", "OR"]).default("AND"),
  groups: z.array(groupSchema).min(1).max(6),
  exit: exitSchema.default({ stop: "atr", atrMult: 1.5, rr: 2, horizon: 60 }),
});

export type StrategyDefinition = z.infer<typeof definitionSchema>;

/** Timeframes usados pela estratégia (ordem do maior para o menor). */
export function timeframesOf(def: StrategyDefinition): StrategyTf[] {
  const set = new Set(def.groups.flatMap((g) => g.conditions.map((c) => c.tf)));
  return STRATEGY_TFS.filter((t) => set.has(t)).reverse();
}

/** Menor timeframe usado = timeframe de execução (gatilho e backtest). */
export function executionTf(def: StrategyDefinition): StrategyTf {
  const tfs = timeframesOf(def);
  return tfs[tfs.length - 1] ?? "4h";
}

export const usesLiveOnly = (def: StrategyDefinition) => def.groups.flatMap((g) => g.conditions).filter((c) => featureSpec(c.feature)?.liveOnly).map((c) => c.feature);

/** Modelos iniciais (o usuário ajusta e salva). */
export const STRATEGY_TEMPLATES: Array<{ name: string; description: string; definition: StrategyDefinition }> = [
  {
    name: "Pullback em tendência (MTF)",
    description: "1D em alta estrutural, 4H com RSI recuando para a zona de 40–55 e EMA score positivo.",
    definition: {
      version: 1,
      direction: "long",
      logic: "AND",
      groups: [
        {
          logic: "AND",
          conditions: [
            { tf: "1d", feature: "trend", op: "==", value: "bullish" },
            { tf: "4h", feature: "ema_score", op: ">", value: 20 },
            { tf: "4h", feature: "rsi", op: "<", value: 55 },
            { tf: "4h", feature: "rsi", op: ">", value: 40 },
          ],
        },
      ],
      exit: { stop: "atr", atrMult: 1.5, rr: 2, horizon: 60 },
    },
  },
  {
    name: "Varredura de liquidez + CHoCH",
    description: "4H varreu liquidez abaixo e 1H confirmou mudança de caráter altista.",
    definition: {
      version: 1,
      direction: "long",
      logic: "AND",
      groups: [
        {
          logic: "AND",
          conditions: [
            { tf: "4h", feature: "sweep", op: "==", value: "bullish" },
            { tf: "1h", feature: "last_event", op: "==", value: "CHoCH_bullish" },
            { tf: "1h", feature: "bars_since_event", op: "<=", value: 3 },
          ],
        },
      ],
      exit: { stop: "structure", atrMult: 1.5, rr: 2.5, horizon: 60 },
    },
  },
  {
    name: "Compressão → rompimento",
    description: "ATR no percentil baixo e candle com volume relativo alto rompendo a banda superior.",
    definition: {
      version: 1,
      direction: "long",
      logic: "AND",
      groups: [
        {
          logic: "AND",
          conditions: [
            { tf: "4h", feature: "atr_percentile", op: "<", value: 35 },
            { tf: "4h", feature: "rvol", op: ">=", value: 1.8 },
            { tf: "4h", feature: "bb_position", op: ">", value: 0.95 },
          ],
        },
      ],
      exit: { stop: "atr", atrMult: 1.2, rr: 2, horizon: 40 },
    },
  },
  {
    name: "Tendência de baixa: repique para vender",
    description: "1D baixista, 4H em repique (RSI 50–65) abaixo da EMA 200.",
    definition: {
      version: 1,
      direction: "short",
      logic: "AND",
      groups: [
        {
          logic: "AND",
          conditions: [
            { tf: "1d", feature: "trend", op: "==", value: "bearish" },
            { tf: "4h", feature: "above_ema200", op: "==", value: false },
            { tf: "4h", feature: "rsi", op: ">", value: 50 },
            { tf: "4h", feature: "rsi", op: "<", value: 65 },
          ],
        },
      ],
      exit: { stop: "atr", atrMult: 1.5, rr: 2, horizon: 60 },
    },
  },
];

export function describeCondition(c: Condition): string {
  const spec = featureSpec(c.feature);
  const op = c.op === "==" ? "=" : c.op === "!=" ? "≠" : c.op;
  const v = typeof c.value === "boolean" ? (c.value ? "sim" : "não") : String(c.value);
  return `${c.tf.toUpperCase()} ${spec?.label ?? c.feature} ${op} ${v}`;
}
