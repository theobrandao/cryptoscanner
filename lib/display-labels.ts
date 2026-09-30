/**
 * Rótulos de exibição em português para os valores internos dos motores (que seguem em inglês por serem
 * chaves de lógica, cache e API). Usar só na interface e nos textos gerados para o usuário.
 */
export const SCORE_LABEL_PT: Record<string, string> = { Exceptional: "Excepcional", Strong: "Forte", Good: "Bom", Moderate: "Moderado", Low: "Baixo" };

export const REGIME_PT: Record<string, string> = {
  "Bull Trend": "Tendência de alta",
  "Bear Trend": "Tendência de baixa",
  Range: "Lateral",
  Expansion: "Expansão",
  Compression: "Compressão",
  "High Volatility": "Volatilidade alta",
};

export const PHASE_PT: Record<string, string> = { Expansion: "Expansão", Pullback: "Pullback", Reversal: "Reversão", Range: "Lateral" };

export const SETUP_STATE_PT: Record<string, string> = {
  DETECTED: "Detectado",
  FORMING: "Em formação",
  READY: "Pronto",
  TRIGGERED: "Acionado",
  ACTIVE: "Ativo",
  TARGET_HIT: "Alvo atingido",
  INVALIDATED: "Invalidado",
  EXPIRED: "Expirado",
};

export const NO_TRADE_CODE_PT: Record<string, string> = {
  "R:R < 1": "R:R < 1",
  "NO DIRECTION": "sem direção",
  "NO SETUP": "sem setup",
  "CONFLICTING TF": "timeframes em conflito",
  DATA: "dados indisponíveis",
  "LOW CONFLUENCE": "confluência baixa",
  "NO TRADE": "sem entrada",
};

export const CONDITION_PT: Record<string, string> = {
  OK: "ok",
  NO_SETUP: "sem setup",
  NEUTRAL: "neutro",
  LOW_CONFLUENCE: "confluência baixa",
  CONFLICTING_TIMEFRAMES: "timeframes em conflito",
  DATA_UNAVAILABLE: "dados indisponíveis",
};

export const directionPt = (d: string | null | undefined) => (d === "bullish" ? "Altista" : d === "bearish" ? "Baixista" : "Neutro");

export const pt = (map: Record<string, string>, v: string | null | undefined) => (v == null ? "—" : (map[v] ?? v));

export const VOLATILITY_PT: Record<string, string> = { VERY_LOW: "muito baixa", LOW: "baixa", NORMAL: "normal", HIGH: "alta", EXTREME: "extrema" };

export const DATA_STATUS_PT: Record<string, string> = { LIVE: "AO VIVO", FALLBACK: "FONTE ALTERNATIVA", DEGRADED: "DEGRADADO", DELAYED: "ATRASADO", OFFLINE: "OFFLINE" };

/** Tipos de pool de liquidez (motor de liquidez) em texto de leitura. */
export const POOL_KIND_PT: Record<string, string> = {
  EQH: "topos iguais (EQH)",
  EQL: "fundos iguais (EQL)",
  PDH: "máxima do dia anterior (PDH)",
  PDL: "mínima do dia anterior (PDL)",
  PWH: "máxima da semana anterior (PWH)",
  PWL: "mínima da semana anterior (PWL)",
  SWING_HIGH: "topo de swing",
  SWING_LOW: "fundo de swing",
};

/** Rótulo curto para o gráfico. */
export const poolShort = (k: string) => (k === "SWING_HIGH" ? "topo" : k === "SWING_LOW" ? "fundo" : k);

export const candlesAgo = (n: number) => (n <= 0 ? "no último candle" : n === 1 ? "há 1 candle" : `há ${n} candles`);

/** Número com vírgula decimal (texto em português). */
export const dec = (v: number, d = 2) => v.toFixed(d).replace(".", ",");
