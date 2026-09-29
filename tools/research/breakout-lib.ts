/**
 * Núcleo da pesquisa de rompimento (Donchian) — puro e causal.
 *   sinal   : fechamento acima da máxima dos `entryN` candles anteriores (abaixo da mínima p/ short)
 *   filtro  : opcional, fechamento acima/abaixo da EMA200
 *   entrada : fechamento do candle do sinal (ou abertura do seguinte, se `nextOpen`)
 *   stop    : entrada − stopAtr × ATR(20); depois trailing pela mínima (máxima) dos `trailN` últimos candles,
 *             atualizado no fechamento e válido a partir do candle seguinte
 *   saída   : toque no stop; gap além do stop sai na abertura (pior preço)
 *   custo   : `cost` por lado sobre o notional (taxa + slippage)
 */
import type { Candle } from "@/types/market";
import { atr, ema } from "@/lib/indicators/core";

export type Hist = Record<string, Record<string, Candle[]>>;

export interface Cfg {
  entryN: number;
  trailN: number;
  stopAtr: number;
  trend: boolean;
  side: "long" | "both";
}

export interface Trade {
  symbol: string;
  time: number;
  index: number;
  dir: 1 | -1;
  r: number;
  bars: number;
  exitTime: number;
}

export interface Prepared {
  cs: Candle[];
  atr: number[];
  ema200: number[];
}

export function prepare(cs: Candle[]): Prepared {
  return { cs, atr: atr(cs, 20), ema200: ema(cs.map((c) => c.close), 200) };
}

/** Simula uma posição aberta em `t` (saída pelo stop inicial + trailing). */
export function simulateFrom(p: Prepared, t: number, dir: 1 | -1, cfg: Pick<Cfg, "trailN" | "stopAtr">, cost: number, nextOpen = false): { r: number; exitIndex: number } | null {
  const { cs } = p;
  const at = p.atr[t];
  if (at == null || !Number.isFinite(at) || at <= 0) return null;
  const ei = nextOpen ? t + 1 : t;
  if (ei >= cs.length - 1) return null;
  const entry = nextOpen ? (cs[ei] as Candle).open : (cs[t] as Candle).close;
  const stop0 = entry - dir * cfg.stopAtr * at;
  const risk = Math.abs(entry - stop0);
  let stop = stop0;
  let exit = NaN;
  let j = nextOpen ? ei : t + 1;
  for (; j < cs.length; j++) {
    const k = cs[j] as Candle;
    if (dir > 0 ? k.low <= stop : k.high >= stop) {
      exit = dir > 0 ? Math.min(stop, k.open) : Math.max(stop, k.open);
      break;
    }
    const from = Math.max(0, j - cfg.trailN + 1);
    let trail = dir > 0 ? Infinity : -Infinity;
    for (let q = from; q <= j; q++) {
      const x = cs[q] as Candle;
      trail = dir > 0 ? Math.min(trail, x.low) : Math.max(trail, x.high);
    }
    stop = dir > 0 ? Math.max(stop, trail) : Math.min(stop, trail);
  }
  if (!Number.isFinite(exit)) {
    exit = (cs[cs.length - 1] as Candle).close;
    j = cs.length - 1;
  }
  const gross = dir * (exit - entry);
  return { r: (gross - cost * (entry + exit)) / risk, exitIndex: j };
}

/** Sinal de rompimento no candle `t` (0 = nenhum). */
export function signalAt(p: Prepared, t: number, cfg: Cfg): 0 | 1 | -1 {
  const { cs } = p;
  const c = cs[t] as Candle;
  let hi = -Infinity;
  let lo = Infinity;
  for (let q = t - cfg.entryN; q < t; q++) {
    const x = cs[q] as Candle;
    hi = Math.max(hi, x.high);
    lo = Math.min(lo, x.low);
  }
  const e = p.ema200[t] as number;
  if (c.close > hi && (!cfg.trend || c.close > e)) return 1;
  if (cfg.side === "both" && c.close < lo && (!cfg.trend || c.close < e)) return -1;
  return 0;
}

/** Trades da estratégia: uma posição por vez por ativo. */
export function runStrategy(symbol: string, p: Prepared, cfg: Cfg, cost: number, nextOpen = false): Trade[] {
  const out: Trade[] = [];
  let t = Math.max(cfg.entryN, 210);
  while (t < p.cs.length - 1) {
    const dir = signalAt(p, t, cfg);
    if (!dir) {
      t++;
      continue;
    }
    const s = simulateFrom(p, t, dir, cfg, cost, nextOpen);
    if (!s) {
      t++;
      continue;
    }
    out.push({ symbol, time: (p.cs[t] as Candle).openTime, index: t, dir, r: s.r, bars: s.exitIndex - t, exitTime: (p.cs[s.exitIndex] as Candle).closeTime });
    t = s.exitIndex + 1;
  }
  return out;
}

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function stats(rs: readonly number[]) {
  const pos = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const neg = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  let eq = 0;
  let pk = 0;
  let dd = 0;
  for (const r of rs) {
    eq += r;
    pk = Math.max(pk, eq);
    dd = Math.max(dd, pk - eq);
  }
  return { n: rs.length, e: mean(rs), pf: neg > 0 ? pos / neg : Infinity, win: rs.length ? rs.filter((r) => r > 0).length / rs.length : NaN, sumR: eq, ddR: dd };
}

export function fmt(rs: readonly number[]) {
  const s = stats(rs);
  return `n=${String(s.n).padStart(4)} E=${s.e.toFixed(3).padStart(6)} PF=${s.pf.toFixed(2)} win=${(s.win * 100).toFixed(0)}% somaR=${s.sumR.toFixed(1)} ddR=${s.ddR.toFixed(1)}`;
}

export function grid(): Cfg[] {
  const cfgs: Cfg[] = [];
  for (const entryN of [20, 55]) for (const trailN of [10, 20]) for (const stopAtr of [2, 3]) for (const trend of [false, true]) for (const side of ["long", "both"] as const) cfgs.push({ entryN, trailN, stopAtr, trend, side });
  return cfgs;
}

export const cfgKey = (c: Cfg) => `N${c.entryN} trail${c.trailN} stop${c.stopAtr}ATR ${c.trend ? "EMA200" : "livre"} ${c.side}`;

/** PRNG determinístico (LCG) */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x1_0000_0000);
}
