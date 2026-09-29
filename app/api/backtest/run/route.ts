import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { definitionSchema } from "@/lib/strategies/definition";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { TIMEFRAMES } from "@/types/market";
import { requireEntitlement } from "@/services/subscription-service";
import { getStrategy } from "@/services/strategy-service";
import { checkBacktestAccess, runBacktest } from "@/services/backtest-service";
import { track } from "@/services/analytics-service";

export const maxDuration = 60;

const bodySchema = z.object({
  symbol: z.string().trim().toUpperCase().max(12),
  exchange: z.enum(VENUES).default("binance"),
  instrument: z.enum(INSTRUMENTS).default("spot"),
  mode: z.enum(["setup", "strategy"]).default("setup"),
  timeframe: z.enum(TIMEFRAMES).default("4h"),
  strategyId: z.string().max(40).optional(),
  definition: definitionSchema.optional(),
  days: z.number().int().min(30).max(1095).default(180),
  feeBps: z.number().min(0).max(100).default(10),
  slippageBps: z.number().min(0).max(100).default(5),
  fundingPct8h: z.number().min(-0.5).max(0.5).default(0.01),
  entryDelay: z.number().int().min(0).max(5).default(0),
  riskPct: z.number().min(0.1).max(10).default(1),
});

/** Backtest com taxas, slippage, funding (perpétuo) e atraso de entrada; curva de capital e métricas em R. */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  await enforceRateLimit(req, "llm", `bt:${user.id}`);
  const b = await parseBody(req, bodySchema);
  let definition = b.definition;
  let strategyName: string | undefined;
  if (b.mode === "strategy" && b.strategyId) {
    const s = await getStrategy(user.id, b.strategyId);
    definition = s.definition;
    strategyName = s.name;
  }
  const request = {
    symbol: b.symbol.replace(/USDT$/, ""),
    exchange: b.exchange,
    instrument: b.instrument,
    mode: b.mode,
    timeframe: b.timeframe,
    definition,
    strategyName,
    days: b.days,
    costs: { feeBps: b.feeBps, slippageBps: b.slippageBps, fundingPct8h: b.fundingPct8h, entryDelay: b.entryDelay, perp: b.instrument === "perp", riskPct: b.riskPct },
  };
  checkBacktestAccess(access, request);
  const r = await runBacktest(request);
  await track("backtest_run", { userId: user.id, props: { mode: b.mode, timeframe: r.params.timeframe, days: b.days, trades: r.trades.length } });
  return ok(r);
});
