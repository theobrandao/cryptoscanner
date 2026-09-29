import { createHash } from "node:crypto";
import { requirePrisma } from "@/database/client";
import { ApiError } from "@/lib/api";
import { ASSETS, getAsset } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import type { Instrument, Venue } from "@/lib/venues";
import { definitionSchema, executionTf, featureSpec, timeframesOf, usesLiveOnly, type StrategyDefinition, type StrategyTf } from "@/lib/strategies/definition";
import { computeFeatures, evaluateStrategy, type FeatureSet, type StrategyEvaluation } from "@/lib/strategies/engine";
import { getSeriesWithFallback } from "@/services/market/venues";
import { createLimiter } from "@/services/market/providers/types";
import { getMarketContext } from "@/services/market-context-service";
import type { AccessView } from "@/services/subscription-service";
import type { Timeframe } from "@/types/market";

const log = createLogger("strategy");

export interface StrategyRecord {
  id: string;
  name: string;
  description: string | null;
  definition: StrategyDefinition;
  createdAt: Date;
  updatedAt: Date;
}

export async function listStrategies(userId: string): Promise<StrategyRecord[]> {
  const rows = await requirePrisma().strategy.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return rows.map((r) => ({ ...r, definition: definitionSchema.parse(r.definition) }));
}

export async function getStrategy(userId: string, id: string): Promise<StrategyRecord> {
  const r = await requirePrisma().strategy.findFirst({ where: { id, userId } });
  if (!r) throw new ApiError(404, "Estratégia não encontrada", "not_found");
  return { ...r, definition: definitionSchema.parse(r.definition) };
}

export async function createStrategy(userId: string, access: AccessView, input: { name: string; description?: string; definition: StrategyDefinition }) {
  const prisma = requirePrisma();
  const count = await prisma.strategy.count({ where: { userId } });
  if (count >= access.entitlements.maxStrategies) throw new ApiError(403, `Limite de ${access.entitlements.maxStrategies} estratégias no seu plano`, "strategy_limit");
  const def = definitionSchema.parse(input.definition);
  return prisma.strategy.create({ data: { userId, name: input.name, description: input.description ?? null, definition: def } });
}

export async function updateStrategy(userId: string, id: string, input: { name?: string; description?: string | null; definition?: StrategyDefinition }) {
  await getStrategy(userId, id);
  return requirePrisma().strategy.update({
    where: { id },
    data: { ...(input.name ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.definition ? { definition: definitionSchema.parse(input.definition) } : {}) },
  });
}

export async function deleteStrategy(userId: string, id: string) {
  await getStrategy(userId, id);
  await requirePrisma().strategy.delete({ where: { id } });
}

/* ------------------------------------------------------------------ avaliação ao vivo */

export interface LiveEvaluation extends StrategyEvaluation {
  symbol: string;
  exchange: Venue;
  instrument: Instrument;
  dataVenue: Venue;
  executionTf: StrategyTf;
  price: number | null;
  /** abertura do último candle FECHADO do timeframe de execução (identifica o candle do sinal) */
  lastClosedAt: number | null;
  features: Partial<Record<StrategyTf, FeatureSet>>;
  live: FeatureSet;
  evaluatedAt: number;
}

async function liveFeatures(def: StrategyDefinition, symbol: string, exchange: Venue, instrument: Instrument): Promise<FeatureSet> {
  const live = usesLiveOnly(def);
  if (!live.length) return {};
  const c = await getMarketContext(symbol, executionTf(def) as Timeframe, { exchange, instrument });
  return {
    confluence_score: c.confluence.score,
    setup_state: c.setup?.state ?? "NONE",
    funding_rate: c.derivatives ? c.derivatives.fundingRate * 100 : null,
    oi_change_24h: c.derivatives?.openInterestChange24hPct ?? null,
  };
}

export async function evaluateLive(def: StrategyDefinition, symbol: string, exchange: Venue = "binance", instrument: Instrument = "spot"): Promise<LiveEvaluation> {
  const asset = getAsset(symbol);
  if (!asset) throw new ApiError(400, `Ativo desconhecido: ${symbol}`, "validation");
  const tfs = timeframesOf(def);
  let dataVenue: Venue = exchange;
  let price: number | null = null;
  let lastClosedAt: number | null = null;
  const features: Partial<Record<StrategyTf, FeatureSet>> = {};
  await Promise.all(
    tfs.map(async (tf) => {
      try {
        const s = await getSeriesWithFallback(exchange, instrument, asset, tf as Timeframe, 300);
        features[tf] = computeFeatures(s.closed);
        if (tf === executionTf(def)) {
          dataVenue = s.venue;
          price = s.closed[s.closed.length - 1]?.close ?? null;
          lastClosedAt = s.closed[s.closed.length - 1]?.openTime ?? null;
        }
      } catch (err) {
        log.warn("série indisponível para estratégia", { symbol, tf, error: (err as Error).message });
      }
    }),
  );
  const live = await liveFeatures(def, asset.symbol, exchange, instrument).catch(() => ({}));
  const ev = evaluateStrategy(def, features, live);
  return { ...ev, symbol: asset.symbol, exchange, instrument, dataVenue, executionTf: executionTf(def), price, lastClosedAt, features, live, evaluatedAt: Date.now() };
}

export const definitionHash = (def: StrategyDefinition) => createHash("sha1").update(JSON.stringify(def)).digest("hex").slice(0, 16);

export interface ScanRow {
  symbol: string;
  pass: boolean;
  passedConditions: number;
  totalConditions: number;
  price: number | null;
  missing: string[];
  dataVenue: Venue;
}

/** Roda a estratégia no universo (30 ativos). Cache 60 s por definição × venue × instrumento. */
export async function scanStrategy(def: StrategyDefinition, exchange: Venue = "binance", instrument: Instrument = "spot") {
  const key = `stratscan:v1:${definitionHash(def)}:${exchange}:${instrument}`;
  const res = await cached(key, 60, async () => {
    const limiter = createLimiter(4, 0);
    const rows: ScanRow[] = [];
    const errors: string[] = [];
    await Promise.all(
      ASSETS.map((a) =>
        limiter(async () => {
          try {
            const e = await evaluateLive(def, a.symbol, exchange, instrument);
            const all = e.groups.flatMap((g) => g.results);
            rows.push({ symbol: a.symbol, pass: e.pass, passedConditions: all.filter((r) => r.pass).length, totalConditions: all.length, price: e.price, missing: e.missing, dataVenue: e.dataVenue });
          } catch (err) {
            errors.push(`${a.symbol}: ${(err as Error).message}`);
          }
        }),
      ),
    );
    rows.sort((x, y) => Number(y.pass) - Number(x.pass) || y.passedConditions / y.totalConditions - x.passedConditions / x.totalConditions);
    return { generatedAt: Date.now(), exchange, instrument, rows, errors };
  });
  return res.value;
}

/** Validação para o backtest: features só-ao-vivo não existem no histórico. */
export function assertBacktestable(def: StrategyDefinition) {
  const live = usesLiveOnly(def);
  if (live.length) throw new ApiError(400, `Backtest não reconstrói ${live.map((k) => featureSpec(k)?.label ?? k).join(", ")} no histórico. Remova essas condições para testar.`, "live_only_feature");
}
