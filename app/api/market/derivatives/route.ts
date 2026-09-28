import { connection } from "next/server";
import { z } from "zod";
import { enforceRateLimit, ok, parseQuery, withApi } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { getDerivativesSnapshot, type DerivativesSnapshot } from "@/services/market/providers/binance-futures";

const querySchema = z.object({ symbols: z.string().default("BTC,ETH,SOL") });

/** Derivativos (Binance Futures público): funding, open interest, long/short e agressão taker por ativo. */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const q = parseQuery(req, querySchema);
  const symbols = [...new Set(q.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 10);
  const items: DerivativesSnapshot[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  await Promise.all(
    symbols.map(async (symbol) => {
      const asset = ASSETS.find((a) => a.symbol === symbol);
      if (!asset) {
        errors.push({ symbol, error: "ativo desconhecido" });
        return;
      }
      try {
        const res = await cached<DerivativesSnapshot>(`derivatives:${symbol}`, 60, () => getDerivativesSnapshot(symbol, asset.binancePair), { staleTtlSeconds: 3600 });
        items.push({ ...res.value });
      } catch (err) {
        errors.push({ symbol, error: (err as Error).message });
      }
    }),
  );
  items.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
  return ok({ items, errors, source: "binance-futures" });
});
