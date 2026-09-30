import type { Candle, Timeframe } from "@/types/market";
import { TIMEFRAME_MS } from "@/lib/timeframes";

/**
 * Data Quality Engine — validação de séries OHLCV e classificação do estado do dado.
 * Puro (sem I/O): recebe candles e metadados, devolve série limpa + diagnóstico.
 */

export type DataStatus = "LIVE" | "DELAYED" | "DEGRADED" | "OFFLINE" | "FALLBACK";

export interface DataQuality {
  status: DataStatus;
  source: string;
  /** epoch ms da coleta no provedor */
  fetchedAt: number;
  /** idade da coleta no momento da resposta */
  ageMs: number;
  /** abertura do último candle FECHADO */
  lastClosedOpenTime: number | null;
  /** candles ausentes entre o primeiro e o último */
  gaps: number;
  /** candles descartados por OHLC/timestamp inválido */
  invalid: number;
  /** duplicados removidos */
  duplicates: number;
  /** candles com amplitude estatisticamente anormal (mantidos, apenas sinalizados) */
  outliers: number;
  issues: string[];
}

export interface CandleValidation {
  /** série ordenada, sem duplicados e sem candles inválidos (inclui o candle em formação, se houver) */
  candles: Candle[];
  /** apenas candles fechados (closeTime < now) — base para qualquer sinal */
  closed: Candle[];
  /** candle ainda em formação (null se o último já fechou) */
  forming: Candle | null;
  gaps: number;
  invalid: number;
  duplicates: number;
  outliers: number;
  issues: string[];
}

const finite = (n: number) => typeof n === "number" && Number.isFinite(n);

/** OHLC coerente: todos finitos, positivos, high ≥ max(open, close, low), low ≤ min(open, close), volume ≥ 0. */
export function isValidCandle(c: Candle): boolean {
  if (![c.openTime, c.closeTime, c.open, c.high, c.low, c.close, c.volume].every(finite)) return false;
  if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) return false;
  if (c.volume < 0) return false;
  if (c.closeTime <= c.openTime) return false;
  const eps = Math.max(c.high, 1) * 1e-9;
  if (c.high + eps < Math.max(c.open, c.close, c.low)) return false;
  if (c.low - eps > Math.min(c.open, c.close, c.high)) return false;
  return true;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * Valida e normaliza uma série: ordena por openTime, remove duplicados (mantém o último recebido),
 * descarta OHLC inválido, conta lacunas e separa o candle em formação.
 * Outlier: amplitude (high−low)/close acima de 12× a mediana da série — sinalizado, não removido.
 */
export function validateCandles(input: readonly Candle[], timeframe: Timeframe, now = Date.now()): CandleValidation {
  const issues: string[] = [];
  const span = TIMEFRAME_MS[timeframe];
  const byTime = new Map<number, Candle>();
  let invalid = 0;
  let duplicates = 0;
  for (const c of input) {
    if (!isValidCandle(c)) {
      invalid++;
      continue;
    }
    if (byTime.has(c.openTime)) duplicates++;
    byTime.set(c.openTime, c);
  }
  const candles = [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
  if (invalid) issues.push(`${invalid} candle(s) com OHLC/timestamp inválido descartado(s)`);
  if (duplicates) issues.push(`${duplicates} candle(s) duplicado(s) removido(s)`);

  // Lacunas: semanal da Binance abre segunda 00:00 UTC (intervalo fixo de 7 d), então a regra vale para todos os TFs.
  let gaps = 0;
  for (let i = 1; i < candles.length; i++) {
    const d = (candles[i] as Candle).openTime - (candles[i - 1] as Candle).openTime;
    if (d > span * 1.5) gaps += Math.round(d / span) - 1;
  }
  if (gaps) issues.push(`${gaps} candle(s) ausente(s) na série`);

  const ranges = candles.map((c) => (c.high - c.low) / c.close);
  const med = median(ranges);
  let outliers = 0;
  if (Number.isFinite(med) && med > 0) for (const r of ranges) if (r > med * 12) outliers++;
  if (outliers) issues.push(`${outliers} candle(s) com amplitude anormal (> 12× a mediana)`);

  const last = candles[candles.length - 1];
  const forming = last && last.closeTime >= now ? last : null;
  const closed = forming ? candles.slice(0, -1) : candles;
  return { candles, closed, forming, gaps, invalid, duplicates, outliers, issues };
}

export interface StatusInput {
  source: string;
  primarySource: string;
  fetchedAt: number;
  /** true quando veio do cache por falha de todos os provedores */
  stale: boolean;
  timeframe?: Timeframe;
  lastClosedOpenTime?: number | null;
  gaps?: number;
  invalid?: number;
  divergencePct?: number | null;
  now?: number;
}

/** Divergência de preço entre fontes acima da qual o dado é marcado como DEGRADED. */
export const DIVERGENCE_THRESHOLD_PCT = 0.5;

/**
 * Classificação (do pior para o melhor): OFFLINE > DELAYED > DEGRADED > FALLBACK > LIVE.
 * - DELAYED: dado servido do cache por falha da fonte, ou último candle fechado mais velho que 2 períodos.
 * - DEGRADED: lacunas, candles descartados ou divergência entre fontes acima do limite.
 * - FALLBACK: fonte secundária (ex.: Kraken no lugar da Binance) com dado íntegro.
 */
export function classifyStatus(i: StatusInput): { status: DataStatus; issues: string[] } {
  const now = i.now ?? Date.now();
  const issues: string[] = [];
  if (!Number.isFinite(i.fetchedAt) || i.fetchedAt <= 0) return { status: "OFFLINE", issues: ["sem coleta válida"] };
  let delayed = i.stale;
  if (i.stale) issues.push(`dado de cache (coleta há ${Math.round((now - i.fetchedAt) / 60_000)} min)`);
  if (i.timeframe && i.lastClosedOpenTime != null) {
    const span = TIMEFRAME_MS[i.timeframe];
    // último fechado deveria ter aberto há no máximo 2 períodos (o atual está em formação)
    const lag = now - (i.lastClosedOpenTime + span);
    if (lag > span * 2) {
      delayed = true;
      issues.push(`último candle fechado atrasado em ${Math.round(lag / span)} período(s)`);
    }
  }
  if (delayed) return { status: "DELAYED", issues };
  const degraded = (i.gaps ?? 0) > 0 || (i.invalid ?? 0) > 0 || (i.divergencePct != null && Math.abs(i.divergencePct) > DIVERGENCE_THRESHOLD_PCT);
  if (i.divergencePct != null && Math.abs(i.divergencePct) > DIVERGENCE_THRESHOLD_PCT) issues.push(`divergência de ${i.divergencePct.toFixed(2).replace(".", ",")}% entre fontes`);
  if (degraded) return { status: "DEGRADED", issues };
  if (i.source !== i.primarySource) return { status: "FALLBACK", issues: [`fonte secundária (${i.source})`] };
  return { status: "LIVE", issues };
}

/** Divergência percentual de b em relação a a. */
export function priceDivergencePct(a: number, b: number): number | null {
  if (!finite(a) || !finite(b) || a <= 0 || b <= 0) return null;
  return ((b - a) / a) * 100;
}
