import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, parseBody, withApi } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { PATTERN_KEYS } from "@/lib/patterns/catalog";
import { PLANS } from "@/lib/plans";
import { TIMEFRAMES } from "@/types/market";
import { requireCoreUser } from "@/services/subscription-service";

const createSchema = z
  .object({
    symbol: symbolSchema,
    kind: z.enum(["price_above", "price_below", "rsi_above", "rsi_below", "pattern", "volume"]),
    timeframe: z.enum(TIMEFRAMES).default("4h"),
    threshold: z.number().optional(),
    pattern: z.enum(PATTERN_KEYS).optional(),
    channel: z.enum(["log", "telegram", "both"]).default("log"),
  })
  .refine((a) => (a.kind.startsWith("price") || a.kind.startsWith("rsi") ? typeof a.threshold === "number" : true), {
    message: "threshold obrigatório para alertas de preço/RSI",
    path: ["threshold"],
  });

export const GET = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const items = await requirePrisma().alert.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true, name: true } } }, orderBy: { createdAt: "desc" } });
  return ok({ items });
});

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  const body = await parseBody(req, createSchema);
  if (body.channel !== "log" && !PLANS[user.plan].telegramAlerts) throw new ApiError(403, "Alertas no Telegram exigem plano PRO ou PLATINUM", "plan_required");
  const prisma = requirePrisma();
  const def = ASSETS.find((a) => a.symbol === body.symbol)!;
  const asset = await prisma.asset.upsert({
    where: { symbol: def.symbol },
    update: {},
    create: { symbol: def.symbol, name: def.name, binancePair: def.binancePair, krakenPair: def.krakenPair, coingeckoId: def.coingeckoId, sortOrder: def.sortOrder },
  });
  const count = await prisma.alert.count({ where: { userId: user.id, active: true } });
  if (count >= 50) throw new ApiError(400, "Limite de 50 alertas ativos", "limit");
  const alert = await prisma.alert.create({
    data: { userId: user.id, assetId: asset.id, kind: body.kind, timeframe: body.timeframe, threshold: body.threshold, pattern: body.pattern, channel: body.channel },
  });
  return ok({ alert });
});
