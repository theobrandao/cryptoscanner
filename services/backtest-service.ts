import { ApiError } from "@/lib/api";
import { getAsset } from "@/lib/assets";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import type { Instrument, Venue } from "@/lib/venues";
import { runSignals, strategySignals, type BtResult, type CostModel, type Signal } from "@/lib/backtest/engine";
import { backtestSetup } from "@/lib/engines/setup-backtest";
import { executionTf, timeframesOf, type StrategyDefinition, type StrategyTf } from "@/lib/strategies/definition";
import { getVenueHistory } from "@/services/market/venues";
import { assertBacktestable } from "@/services/strategy-service";
import type { AccessView } from "@/services/subscription-service";
import type { Candle, Timeframe } from "@/types/market";

export const MAX_BACKTEST_BARS = 3000;

export interface BacktestRequest {
  symbol: string;
  exchange: Venue;
  instrument: Instrument;
  mode: "setup" | "strategy";
  timeframe?: Timeframe;
  definition?: StrategyDefinition;
  strategyName?: string;
  days: number;
  costs: CostModel;
}

export interface BacktestResponse extends BtResult {
  params: {
    symbol: string;
    exchange: Venue;
    instrument: Instrument;
    mode: "setup" | "strategy";
    timeframe: Timeframe;
    strategyName: string;
    days: number;
    barsRequested: number;
    costs: CostModel;
  };
  signals: number;
  method: string;
}

const barsFor = (tf: Timeframe, days: number) => Math.min(MAX_BACKTEST_BARS, Math.ceil((days * 86_400_000) / TIMEFRAME_MS[tf]));

/** Histórico disponível por plano: dias do entitlement; multi-timeframe exige ELITE. */
export function checkBacktestAccess(access: AccessView, req: BacktestRequest) {
  if (req.days > access.entitlements.historyDays) throw new ApiError(402, `Seu plano cobre até ${access.entitlements.historyDays} dias de histórico`, "history_locked");
  if (req.mode === "strategy" && req.definition && timeframesOf(req.definition).length > 1 && !access.entitlements.elite) throw new ApiError(402, "Backtest multi-timeframe é recurso do plano ELITE", "elite_required");
}

export async function runBacktest(req: BacktestRequest): Promise<BacktestResponse> {
  const asset = getAsset(req.symbol);
  if (!asset) throw new ApiError(400, `Ativo desconhecido: ${req.symbol}`, "validation");
  const perp = req.instrument === "perp";
  const costs = { ...req.costs, perp };
  if (req.mode === "setup") {
    const tf = req.timeframe ?? "4h";
    const bars = barsFor(tf, req.days) + 220;
    const candles = await getVenueHistory(req.exchange, req.instrument, asset, tf, bars);
    if (candles.length < 320) throw new ApiError(422, `Histórico insuficiente (${candles.length} candles)`, "insufficient_history");
    const bt = backtestSetup(candles);
    const signals: Signal[] = bt.trades.map((t) => ({ index: t.entryIndex, direction: t.direction as Signal["direction"], stop: t.stop, target: t.target, horizon: 40 }));
    const res = runSignals(candles, signals, tf, costs, 220);
    return {
      ...res,
      params: { symbol: asset.symbol, exchange: req.exchange, instrument: req.instrument, mode: "setup", timeframe: tf, strategyName: "CryptoScanner Setup (Structure Pullback)", days: req.days, barsRequested: bars, costs },
      signals: signals.length,
      method:
        "Setup do CryptoScanner re-avaliado candle a candle só com o passado (walk-forward causal). Entrada no fechamento do gatilho + atraso, stop estrutural, saída no TP1, horizonte 40 candles; custos aplicados por operação.",
    };
  }
  const def = req.definition;
  if (!def) throw new ApiError(400, "Estratégia ausente", "validation");
  assertBacktestable(def);
  const et = executionTf(def) as Timeframe;
  const bars = barsFor(et, req.days) + 200;
  const exec = await getVenueHistory(req.exchange, req.instrument, asset, et, bars);
  if (exec.length < 260) throw new ApiError(422, `Histórico insuficiente (${exec.length} candles)`, "insufficient_history");
  const htf: Partial<Record<StrategyTf, Candle[]>> = {};
  const startTime = (exec[0] as Candle).openTime;
  await Promise.all(
    timeframesOf(def)
      .filter((t) => t !== et)
      .map(async (t) => {
        const need = Math.min(MAX_BACKTEST_BARS, Math.ceil(((exec[exec.length - 1] as Candle).closeTime - startTime) / TIMEFRAME_MS[t as Timeframe]) + 320);
        htf[t] = await getVenueHistory(req.exchange, req.instrument, asset, t as Timeframe, need);
      }),
  );
  const signals = strategySignals(def, exec, htf, 200);
  const res = runSignals(exec, signals, et, costs, 200);
  return {
    ...res,
    params: { symbol: asset.symbol, exchange: req.exchange, instrument: req.instrument, mode: "strategy", timeframe: et, strategyName: req.strategyName ?? "Estratégia", days: req.days, barsRequested: bars, costs },
    signals: signals.length,
    method: `Condições avaliadas em cada candle ${et.toUpperCase()} com features de cada timeframe calculadas só sobre candles já fechados naquele instante. Sinal na transição falso → verdadeiro; stop ${def.exit.stop === "atr" ? `ATR × ${def.exit.atrMult}` : "estrutural"}; ${def.exit.mode === "trail" ? `sem alvo — stop móvel na ${def.direction === "long" ? "mínima" : "máxima"} dos últimos ${def.exit.trailN} candles (gap sai na abertura)` : `alvo ${def.exit.rr}R`}; horizonte ${def.exit.horizon} candles; uma posição por vez.`,
  };
}
