import type { Timeframe } from "@/types/market";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import { ASSETS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { createLimiter } from "@/services/market/providers/types";
import { createLogger } from "@/lib/logger";
import { DEFAULT_COSTS, runSignals, strategySignals } from "@/lib/backtest/engine";
import { STRATEGY_TEMPLATES, executionTf, type TemplateValidation } from "@/lib/strategies/definition";
import type { Venue } from "@/lib/venues";
import { getSeriesWithFallback } from "@/services/market/venues";

const log = createLogger("signals");

/** Modelos publicados como validados fora da amostra (saída por trailing). */
export const VALIDATED_MODELS = STRATEGY_TEMPLATES.filter((t) => t.validation && t.definition.exit.mode === "trail");

export interface ActiveSignal {
  model: string;
  symbol: string;
  tf: Timeframe;
  /** fechamento do candle do rompimento (momento da entrada) */
  entryTime: number;
  entry: number;
  initialStop: number;
  /** stop móvel vigente (mínima dos últimos N candles fechados, nunca abaixo do stop inicial) */
  stop: number;
  price: number;
  /** resultado aberto em R (sem custos): (preço − entrada) ÷ (entrada − stop inicial) */
  openR: number;
  /** distância do preço ao stop vigente, % do preço */
  stopDistancePct: number;
  /** R travado pelo stop vigente (negativo = ainda em risco) */
  lockedR: number;
  barsOpen: number;
  /** entrou no último candle fechado */
  isNew: boolean;
  dataVenue: Venue;
}

export interface ClosedSignal {
  model: string;
  symbol: string;
  tf: Timeframe;
  entryTime: number;
  exitTime: number;
  rNet: number;
}

export interface SignalsBoard {
  generatedAt: number;
  models: Array<{ name: string; tf: Timeframe; description: string; validation: TemplateValidation }>;
  active: ActiveSignal[];
  /** saídas nos últimos 30 dias (ganhos e perdas), mais recentes primeiro */
  recent: ClosedSignal[];
  errors: string[];
}

const SERIES_BARS = 600;
const WARMUP = 210;
const RECENT_MS = 30 * 86_400_000;

/**
 * Painel de sinais dos modelos validados: roda o MESMO motor do backtest (strategySignals + runSignals,
 * custos padrão) sobre os últimos 600 candles fechados de cada ativo. Posição aberta = último trade que
 * chegou ao fim da série sem tocar o stop. Cache de 5 min.
 */
export async function getSignalsBoard(): Promise<SignalsBoard> {
  const res = await cached("signals:breakout:v2", 300, async () => {
    const limiter = createLimiter(4, 0);
    const active: ActiveSignal[] = [];
    const recent: ClosedSignal[] = [];
    const errors: string[] = [];
    const now = Date.now();
    await Promise.all(
      VALIDATED_MODELS.flatMap((m) =>
        ASSETS.map((asset) =>
          limiter(async () => {
            const tf = executionTf(m.definition) as Timeframe;
            try {
              const s = await getSeriesWithFallback("binance", "spot", asset, tf, SERIES_BARS);
              const cs = s.closed;
              if (cs.length < WARMUP + 20) return;
              const sig = strategySignals(m.definition, cs, {}, WARMUP);
              const bt = runSignals(cs, sig, tf, DEFAULT_COSTS, WARMUP);
              const last = cs[cs.length - 1];
              for (const t of bt.trades) {
                const open = t.outcome === "expired" && t.entryIndex + t.bars === cs.length - 1 && t.bars < m.definition.exit.horizon;
                if (open && last) {
                  const risk = Math.abs(t.entry - t.stop);
                  const stop = t.trailStop ?? t.stop;
                  active.push({
                    model: m.name,
                    symbol: asset.symbol,
                    tf,
                    entryTime: t.entryTime + TIMEFRAME_MS[tf],
                    entry: t.entry,
                    initialStop: t.stop,
                    stop,
                    price: last.close,
                    openR: (last.close - t.entry) / risk,
                    stopDistancePct: ((last.close - stop) / last.close) * 100,
                    lockedR: (stop - t.entry) / risk,
                    barsOpen: t.bars,
                    isNew: t.bars === 0,
                    dataVenue: s.venue,
                  });
                } else if (t.exitTime >= now - RECENT_MS) {
                  recent.push({ model: m.name, symbol: asset.symbol, tf, entryTime: t.entryTime + TIMEFRAME_MS[tf], exitTime: t.exitTime, rNet: t.rNet });
                }
              }
            } catch (err) {
              errors.push(`${asset.symbol} ${tf}: ${(err as Error).message}`);
              log.warn("série indisponível para sinais", { symbol: asset.symbol, tf, error: (err as Error).message });
            }
          }),
        ),
      ),
    );
    active.sort((a, b) => b.entryTime - a.entryTime);
    recent.sort((a, b) => b.exitTime - a.exitTime);
    return {
      generatedAt: now,
      models: VALIDATED_MODELS.map((m) => ({ name: m.name, tf: executionTf(m.definition) as Timeframe, description: m.description, validation: m.validation as TemplateValidation })),
      active,
      recent: recent.slice(0, 20),
      errors,
    } satisfies SignalsBoard;
  });
  return res.value;
}
