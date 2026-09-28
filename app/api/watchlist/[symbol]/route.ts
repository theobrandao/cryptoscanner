import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, requireUser, withApi } from "@/lib/api";

const patchSchema = z.object({ quantity: z.number().nonnegative().nullable().optional(), avgPrice: z.number().nonnegative().nullable().optional(), note: z.string().max(200).nullable().optional() });

async function findItem(userId: string, symbol: string) {
  const prisma = requirePrisma();
  const item = await prisma.watchlistItem.findFirst({ where: { watchlist: { userId, isDefault: true }, asset: { symbol: symbol.toUpperCase() } } });
  if (!item) throw new ApiError(404, "Item não encontrado na watchlist", "not_found");
  return item;
}

export const PATCH = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { symbol } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  const item = await findItem(user.id, symbol ?? "");
  const updated = await requirePrisma().watchlistItem.update({ where: { id: item.id }, data: body });
  return ok({ item: updated });
});

export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const user = await requireUser(req);
  const { symbol } = await ctx.params;
  const item = await findItem(user.id, symbol ?? "");
  await requirePrisma().watchlistItem.delete({ where: { id: item.id } });
  return ok({ deleted: true });
});
