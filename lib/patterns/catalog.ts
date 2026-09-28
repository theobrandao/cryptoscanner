import type { Direction } from "@/types/market";

export const PATTERN_KEYS = [
  "double_bottom",
  "inverse_head_shoulders",
  "ascending_triangle",
  "bull_flag",
  "falling_wedge",
  "pivot_bullish",
  "support_touch",
  "bear_trap",
  "double_top",
  "head_shoulders",
  "descending_triangle",
  "bear_flag",
  "pivot_bearish",
  "resistance_touch",
  "bull_trap",
  "lateral_consolidation",
] as const;

export type PatternKey = (typeof PATTERN_KEYS)[number];

export interface PatternInfo {
  key: PatternKey;
  label: string;
  direction: Direction;
  description: string;
}

/** Os 17 padrões listados publicamente pela referência (16 chaves; "Cunha de Baixa" é a cunha descendente com viés de alta). */
export const PATTERN_CATALOG: Record<PatternKey, PatternInfo> = {
  double_bottom: {
    key: "double_bottom",
    label: "Fundo Duplo",
    direction: "bullish",
    description: "Dois fundos em nível semelhante separados por um topo intermediário (linha de pescoço).",
  },
  inverse_head_shoulders: {
    key: "inverse_head_shoulders",
    label: "C&O Invertido",
    direction: "bullish",
    description: "Três fundos com o central (cabeça) mais baixo que os laterais (ombros).",
  },
  ascending_triangle: {
    key: "ascending_triangle",
    label: "Triângulo Ascendente",
    direction: "bullish",
    description: "Resistência horizontal com fundos ascendentes; compressão de preço sob a resistência.",
  },
  bull_flag: {
    key: "bull_flag",
    label: "Bandeira de Alta",
    direction: "bullish",
    description: "Impulso forte de alta (mastro) seguido de consolidação curta em canal estreito.",
  },
  falling_wedge: {
    key: "falling_wedge",
    label: "Cunha de Baixa",
    direction: "bullish",
    description: "Topos e fundos descendentes convergentes; a inclinação dos topos é mais acentuada que a dos fundos.",
  },
  pivot_bullish: {
    key: "pivot_bullish",
    label: "Pivot de Alta (HH+HL)",
    direction: "bullish",
    description: "Sequência de topo mais alto (HH) e fundo mais alto (HL) nos pivôs recentes.",
  },
  support_touch: {
    key: "support_touch",
    label: "Toque no Suporte",
    direction: "bullish",
    description: "Preço testou um suporte com múltiplos toques e reagiu para cima no candle.",
  },
  bear_trap: {
    key: "bear_trap",
    label: "Bear Trap (Compra)",
    direction: "bullish",
    description: "Rompimento falso de suporte: o preço fechou abaixo e retornou acima do nível.",
  },
  double_top: {
    key: "double_top",
    label: "Topo Duplo",
    direction: "bearish",
    description: "Dois topos em nível semelhante separados por um fundo intermediário.",
  },
  head_shoulders: {
    key: "head_shoulders",
    label: "Cabeça & Ombros",
    direction: "bearish",
    description: "Três topos com o central (cabeça) mais alto que os laterais (ombros).",
  },
  descending_triangle: {
    key: "descending_triangle",
    label: "Triângulo Descendente",
    direction: "bearish",
    description: "Suporte horizontal com topos descendentes; compressão de preço sobre o suporte.",
  },
  bear_flag: {
    key: "bear_flag",
    label: "Bandeira de Baixa",
    direction: "bearish",
    description: "Impulso forte de baixa seguido de consolidação curta em canal estreito.",
  },
  pivot_bearish: {
    key: "pivot_bearish",
    label: "Pivot de Baixa (LH+LL)",
    direction: "bearish",
    description: "Sequência de topo mais baixo (LH) e fundo mais baixo (LL) nos pivôs recentes.",
  },
  resistance_touch: {
    key: "resistance_touch",
    label: "Toque na Resistência",
    direction: "bearish",
    description: "Preço testou uma resistência com múltiplos toques e reagiu para baixo no candle.",
  },
  bull_trap: {
    key: "bull_trap",
    label: "Bull Trap (Venda)",
    direction: "bearish",
    description: "Rompimento falso de resistência: o preço fechou acima e retornou abaixo do nível.",
  },
  lateral_consolidation: {
    key: "lateral_consolidation",
    label: "Consolidação Lateral",
    direction: "neutral",
    description: "Faixa de preço estreita em relação à volatilidade, sem inclinação relevante.",
  },
};

export const PATTERN_LIST: readonly PatternInfo[] = PATTERN_KEYS.map((k) => PATTERN_CATALOG[k]);
