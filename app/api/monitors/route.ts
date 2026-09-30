import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, okPrivate, parseBody, requireUser, withApi } from "@/lib/api";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { TIMEFRAMES } from "@/types/market";
import { requireEntitlement, requireTimeframe } from "@/services/subscription-service";
import { createMonitor, listMonitors, MONITOR_STATES } from "@/services/monitor-service";
import { track } from "@/services/analytics-service";

export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  return okPrivate({ items: await listMonitors(user.id), limit: access.entitlements.maxMonitors, states: MONITOR_STATES });
});

const bodySchema = z.object({
  symbol: z.string().trim().toUpperCase().max(12),
  timeframe: z.enum(TIMEFRAMES),
  exchange: z.enum(VENUES).default("binance"),
  instrument: z.enum(INSTRUMENTS).default("spot"),
  kind: z.enum(["SETUP", "STRATEGY"]).default("SETUP"),
  strategyId: z.string().max(40).nullable().optional(),
  states: z.array(z.enum(MONITOR_STATES)).max(7).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  notifyPush: z.boolean().optional(),
  notifyTelegram: z.boolean().optional(),
});

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const user = await requireUser(req);
  const access = await requireEntitlement(user);
  const b = await parseBody(req, bodySchema);
  requireTimeframe(access, b.timeframe, "monitors");
  const m = await createMonitor(user.id, access, { ...b, symbol: b.symbol.replace(/USDT$/, "") });
  await track("monitor_created", { userId: user.id, props: { kind: b.kind, timeframe: b.timeframe, exchange: b.exchange, instrument: b.instrument } });
  return okPrivate({ monitor: m }, { status: 201 });
});
