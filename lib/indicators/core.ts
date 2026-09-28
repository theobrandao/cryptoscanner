/**
 * Indicadores técnicos calculados programaticamente (sem LLM).
 * Todas as séries retornam arrays alinhados ao array de entrada; posições sem
 * dados suficientes (aquecimento) recebem NaN.
 */

export function sma(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // Semente: SMA dos primeiros `period` valores.
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i] ?? 0;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (values[i] ?? 0) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder (suavização exponencial 1/period). */
export function rsi(values: readonly number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(values: readonly number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line = values.map((_, i) => {
    const f = fastE[i];
    const s = slowE[i];
    return f === undefined || s === undefined || Number.isNaN(f) || Number.isNaN(s) ? NaN : f - s;
  });
  // Sinal: EMA da linha MACD a partir do primeiro valor válido.
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstValid >= 0) {
    const sub = ema(line.slice(firstValid), signalPeriod);
    for (let i = 0; i < sub.length; i++) signal[firstValid + i] = sub[i] ?? NaN;
  }
  const histogram = line.map((v, i) => {
    const s = signal[i];
    return s === undefined || Number.isNaN(v) || Number.isNaN(s) ? NaN : v - s;
  });
  return { macd: line, signal, histogram };
}

export interface BollingerResult {
  upper: number[];
  middle: number[];
  lower: number[];
  /** largura relativa (upper-lower)/middle */
  bandwidth: number[];
  /** posição do preço dentro da banda 0..1 */
  percentB: number[];
}

export function bollinger(values: readonly number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  const bandwidth = new Array<number>(values.length).fill(NaN);
  const percentB = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const m = middle[i] ?? NaN;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += ((values[j] ?? 0) - m) ** 2;
    const sd = Math.sqrt(variance / period);
    const u = m + mult * sd;
    const l = m - mult * sd;
    upper[i] = u;
    lower[i] = l;
    bandwidth[i] = m === 0 ? NaN : (u - l) / m;
    percentB[i] = u === l ? 0.5 : ((values[i] ?? 0) - l) / (u - l);
  }
  return { upper, middle, lower, bandwidth, percentB };
}

export interface OhlcLike {
  high: number;
  low: number;
  close: number;
}

export function trueRange(candles: readonly OhlcLike[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1]?.close ?? c.close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

/** ATR de Wilder. */
export function atr(candles: readonly OhlcLike[], period = 14): number[] {
  const tr = trueRange(candles);
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + (tr[i] ?? 0)) / period;
    out[i] = prev;
  }
  return out;
}

export interface StochRsiResult {
  k: number[];
  d: number[];
}

/** StochRSI (0..100) com suavização K e D. */
export function stochRsi(values: readonly number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): StochRsiResult {
  const r = rsi(values, rsiPeriod);
  const raw = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i < rsiPeriod + stochPeriod - 1) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const v = r[j] ?? NaN;
      if (Number.isNaN(v)) {
        lo = NaN;
        break;
      }
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    if (Number.isNaN(lo)) continue;
    const cur = r[i] ?? NaN;
    raw[i] = hi === lo ? 50 : ((cur - lo) / (hi - lo)) * 100;
  }
  const k = smoothNan(raw, kSmooth);
  const d = smoothNan(k, dSmooth);
  return { k, d };
}

/** SMA que ignora o aquecimento (NaN) sem propagar NaN indefinidamente. */
function smoothNan(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j] ?? NaN;
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

/** Rate of change percentual em `period` barras. */
export function roc(values: readonly number[], period = 10): number[] {
  return values.map((v, i) => {
    const p = values[i - period];
    return p === undefined || p === 0 ? NaN : ((v - p) / p) * 100;
  });
}

/** Desvio-padrão dos retornos logarítmicos (volatilidade histórica) em `period` barras, anualizado opcionalmente. */
export function historicalVolatility(values: readonly number[], period = 20): number[] {
  const rets = values.map((v, i) => {
    const p = values[i - 1];
    return p === undefined || p <= 0 || v <= 0 ? NaN : Math.log(v / p);
  });
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    let mean = 0;
    let n = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const r = rets[j] ?? NaN;
      if (!Number.isNaN(r)) {
        mean += r;
        n++;
      }
    }
    if (n < period) continue;
    mean /= n;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += ((rets[j] ?? 0) - mean) ** 2;
    out[i] = Math.sqrt(variance / (n - 1));
  }
  return out;
}

export function last(values: readonly number[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== undefined && !Number.isNaN(v)) return v;
  }
  return NaN;
}

export function lastN(values: readonly number[], n: number): number[] {
  return values.slice(Math.max(0, values.length - n));
}

export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return NaN;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Casas decimais adequadas ao preço (ex.: BTC 2, DOGE 5). */
export function priceDecimals(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price >= 1000) return 2;
  if (price >= 1) return 3;
  if (price >= 0.1) return 4;
  if (price >= 0.01) return 5;
  return 6;
}
