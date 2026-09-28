import type { AssetDefinition, Candle, Ticker, Timeframe } from "@/types/market";

export interface MarketProvider {
  readonly name: "binance" | "kraken";
  getCandles(asset: AssetDefinition, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  getTickers(assets: readonly AssetDefinition[]): Promise<Ticker[]>;
  ping(): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

/** Limitador simples de concorrência + espaçamento mínimo entre inícios de chamada. */
export function createLimiter(concurrency: number, minSpacingMs: number) {
  let active = 0;
  let lastStart = 0;
  const queue: Array<() => void> = [];
  const pump = () => {
    while (active < concurrency && queue.length > 0) {
      active++;
      const job = queue.shift();
      job?.();
    }
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      pump();
    });
    try {
      const wait = Math.max(0, lastStart + minSpacingMs - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastStart = Date.now();
      return await fn();
    } finally {
      active--;
      pump();
    }
  };
}
