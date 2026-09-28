import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { getTickers } from "@/services/market/market-service";

async function defaultWatchlist(userId: string) {
  const prisma = requirePrisma();
  const existing = await prisma.watchlist.findFirst({ where: { userId, isDefault: true }, include: { items: { include: { asset: true }, orderBy: { addedAt: "asc" } } } });
  if (existing) return existing;
  return prisma.watchlist.create({ data: { userId, name: "Favoritos", isDefault: true }, include: { items: { include: { asset: true }, orderBy: { addedAt: "asc" } } } });
}

/** Watchlist/carteira do usuário com preços atuais e P&L simulado. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const wl = await defaultWatchlist(user.id);
  const { tickers, source, stale } = await getTickers().catch(() => ({ tickers: [], source: "cache" as const, stale: true }));
  const byS = new Map(tickers.map((t) => [t.symbol, t]));
  const items = wl.items.map((it) => {
    const t = byS.get(it.asset.symbol);
    const value = t && it.quantity ? t.price * it.quantity : null;
    const cost = it.quantity && it.avgPrice ? it.quantity * it.avgPrice : null;
    return {
      id: it.id,
      symbol: it.asset.symbol,
      name: it.asset.name,
      note: it.note,
      quantity: it.quantity,
      avgPrice: it.avgPrice,
      price: t?.price ?? null,
      changePct24h: t?.changePct24h ?? null,
      value,
      cost,
      pnl: value !== null && cost !== null ? value - cost : null,
      pnlPct: value !== null && cost ? ((value - cost) / cost) * 100 : null,
      addedAt: it.addedAt,
    };
  });
  return ok({ id: wl.id, name: wl.name, items, source, stale });
});

const addSchema = z.object({ symbol: symbolSchema, quantity: z.number().nonnegative().optional(), avgPrice: z.number().nonnegative().optional(), note: z.string().max(200).optional() });

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, addSchema);
  const prisma = requirePrisma();
  const def = ASSETS.find((a) => a.symbol === body.symbol);
  if (!def) throw new ApiError(404, "Ativo não encontrado", "asset_not_found");
  const asset = await prisma.asset.upsert({
    where: { symbol: def.symbol },
    update: {},
    create: { symbol: def.symbol, name: def.name, binancePair: def.binancePair, krakenPair: def.krakenPair, coingeckoId: def.coingeckoId, sortOrder: def.sortOrder },
  });
  const wl = await defaultWatchlist(user.id);
  const item = await prisma.watchlistItem.upsert({
    where: { watchlistId_assetId: { watchlistId: wl.id, assetId: asset.id } },
    update: { quantity: body.quantity, avgPrice: body.avgPrice, note: body.note },
    create: { watchlistId: wl.id, assetId: asset.id, quantity: body.quantity, avgPrice: body.avgPrice, note: body.note },
  });
  return ok({ item });
});
