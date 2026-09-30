import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, ok, parseQuery, requireUser, withApi } from "@/lib/api";
import { requireEntitlement, requireTimeframe } from "@/services/subscription-service";
import { parseTimeframe } from "@/lib/timeframes";
import { getMarketContext } from "@/services/market-context-service";
import { INSTRUMENTS, VENUES } from "@/services/market/venues";

export const maxDuration = 60;

const querySchema = z.object({
  tf: z.string().default("4h"),
  candles: z.enum(["0", "1"]).default("1"),
  exchange: z.enum(VENUES).default("binance"),
  instrument: z.enum(INSTRUMENTS).default("spot"),
});

/**
 * Contexto agregado do ativo (um request por troca de ativo/timeframe): ticker, candles, técnicos,
 * estrutura, liquidez, multi-TF, derivativos, setup, confluência e histórico — cada bloco com origem e horário.
 * Aceita BTC ou BTCUSDT. `exchange` (binance|bybit|okx) e `instrument` (spot|perp) definem a venue.
 */
export const GET = withApi(async (req, ctx) => {
  await connection();
  await enforceRateLimit(req, "public");
  // terminal é recurso pago: trial, PRO, ELITE ou admin (decidido no servidor)
  const access = await requireEntitlement(await requireUser(req));
  const { symbol } = await ctx.params;
  const raw = (symbol ?? "").toUpperCase().replace(/USDT$/, "");
  const sym = symbolSchema.parse(raw);
  const q = parseQuery(req, querySchema);
  const tf = parseTimeframe(q.tf);
  requireTimeframe(access, tf, "terminal");
  const c = await getMarketContext(sym, tf, { exchange: q.exchange, instrument: q.instrument });
  return ok(q.candles === "1" ? c : { ...c, candles: [] });
});
