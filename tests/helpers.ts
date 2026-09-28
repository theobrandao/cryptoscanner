import type { Candle } from "@/types/market";

/** Gera candles sintéticos determinísticos a partir de uma série de fechamentos. */
export function candlesFromCloses(closes: number[], startMs = Date.UTC(2026, 0, 1), spanMs = 4 * 3600_000, volume = 1000): Candle[] {
  return closes.map((close, i) => {
    const prev = closes[i - 1] ?? close;
    const open = prev;
    // Pavios proporcionais ao fechamento (garante pivôs fractais estritos em topos/fundos).
    const high = Math.max(close * 1.004, open);
    const low = Math.min(close * 0.996, open);
    return { openTime: startMs + i * spanMs, closeTime: startMs + (i + 1) * spanMs - 1, open, high, low, close, volume, quoteVolume: volume * close };
  });
}

/** Série pseudoaleatória reproduzível (LCG) em torno de uma tendência. */
export function syntheticSeries(n: number, opts: { start?: number; drift?: number; noise?: number; seed?: number } = {}): number[] {
  const { start = 100, drift = 0, noise = 0.01, seed = 42 } = opts;
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift + rnd() * noise * 2);
    out.push(Number(p.toFixed(4)));
  }
  return out;
}

/** Fundo duplo sintético: queda → fundo → repique (pescoço) → segundo fundo → subida. */
export function doubleBottomCloses(): number[] {
  const pre = syntheticSeries(60, { start: 120, drift: -0.002, noise: 0.004, seed: 7 });
  const base = pre[pre.length - 1] ?? 100;
  const leg = (from: number, to: number, steps: number) => Array.from({ length: steps }, (_, i) => from + ((to - from) * (i + 1)) / steps);
  return [...pre, ...leg(base, base * 0.9, 12), ...leg(base * 0.9, base * 0.97, 10), ...leg(base * 0.97, base * 0.905, 10), ...leg(base * 0.905, base * 0.96, 8)];
}

export function doubleTopCloses(): number[] {
  return doubleBottomCloses().map((v) => 200 - v);
}
