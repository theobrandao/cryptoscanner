import { TIMEFRAMES, type Timeframe } from "@/types/market";

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

/** Rótulo exibido na interface (a referência usa 7D para o semanal). */
export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  "5m": "5M",
  "15m": "15M",
  "30m": "30M",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "7D",
};

export const KRAKEN_INTERVAL: Record<Timeframe, number> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080,
};

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === "string" && (TIMEFRAMES as readonly string[]).includes(value);
}

export function parseTimeframe(value: unknown, fallback: Timeframe = "4h"): Timeframe {
  if (typeof value !== "string") return fallback;
  const v = value.toLowerCase();
  if (v === "7d") return "1w";
  return isTimeframe(v) ? v : fallback;
}

/** Timeframes de alta frequência, bloqueados fora do plano PLATINUM (comportamento observado). */
export const HIGH_FREQUENCY_TIMEFRAMES: readonly Timeframe[] = ["5m", "15m", "30m", "1h"];
