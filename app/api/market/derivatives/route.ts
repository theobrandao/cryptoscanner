import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, NO_STORE, ok, parseQuery, withApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { ASSETS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { getDerivativesSnapshot, type DerivativesSnapshot } from "@/services/market/providers/binance-futures";
import { getOkxDerivativesSnapshot } from "@/services/market/providers/okx-derivatives";
import { requireCoreUser } from "@/services/subscription-service";

const log = createLogger("derivatives");
const querySchema = z.object({ symbols: z.string().default("BTC,ETH,SOL") });
/** Texto fixo para fonte fora do ar (a causa fica só no log). */
const PROVIDER_UNAVAILABLE = "dados indisponíveis no momento";
type RouteError = { symbol: string; code: "provider_unavailable" | "unknown_asset"; error: string };

/** Derivativos (Binance Futures público): funding, open interest, long/short e agressão taker por ativo. */
export const GET = withApi(async (req) => {
  await requireCoreUser(req);
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const symbols = [...new Set(q.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 10);
  const items: DerivativesSnapshot[] = [];
  const errors: RouteError[] = [];
  await Promise.all(
    symbols.map(async (symbol) => {
      const asset = ASSETS.find((a) => a.symbol === symbol);
      if (!asset) {
        errors.push({ symbol, code: "unknown_asset", error: "ativo desconhecido" });
        return;
      }
      try {
        const res = await cached<DerivativesSnapshot>(`derivatives:${symbol}`, 60, () => getDerivativesSnapshot(symbol, asset.binancePair), { staleTtlSeconds: 600 });
        items.push({ ...res.value, exchange: "binance" } as DerivativesSnapshot);
      } catch (err) {
        // fallback OKX (instrumento identificado)
        try {
          const o = await cached(`derivatives:v2:okx:${symbol}`, 60, () => getOkxDerivativesSnapshot(symbol), { staleTtlSeconds: 600 });
          items.push(o.value);
        } catch (err2) {
          log.warn("derivativos indisponíveis", { symbol, binance: (err as Error).message, okx: (err2 as Error).message });
          errors.push({ symbol, code: "provider_unavailable", error: PROVIDER_UNAVAILABLE });
        }
      }
    }),
  );
  items.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
  return ok({ items, errors, source: "Binance USDⓈ-M (fallback OKX SWAP)" }, { headers: NO_STORE });
});
