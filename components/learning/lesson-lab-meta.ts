/**
 * Título e instrução dos exercícios interativos, sem o componente (usável no servidor e na lista de aulas
 * sem levar o código dos exercícios). O componente de cada um fica em lesson-widgets.tsx.
 */
export const LAB_META: Record<string, { title: string; hint: string }> = {
  "candles-e-timeframes": { title: "Monte um candle", hint: "Arraste abertura e fechamento e veja como corpo e pavios mudam a leitura." },
  "rsi-stochrsi-macd": { title: "Leia o RSI", hint: "Mova o RSI e veja em que zona o indicador está." },
  fibonacci: { title: "Calcule as retrações", hint: "Informe fundo e topo do movimento; os níveis são calculados na hora." },
  "gestao-de-risco": { title: "Calcule o tamanho da posição", hint: "Defina capital, risco por operação, entrada, stop e alvo." },
  "simulacao-e-dca": { title: "Preço médio no DCA", hint: "Compare o preço médio de aportes fixos com preços que sobem e caem." },
};

export const hasLab = (slug: string) => slug in LAB_META;

/** Id do título de cada etapa da aula: o leitor move o foco para ele ao trocar de etapa. */
export const stepHeadingId = (key: string) => `aula-etapa-${key}`;
