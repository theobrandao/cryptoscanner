import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ok, parseBody, requireUser, withApi } from "@/lib/api";
import { TIMEFRAMES } from "@/types/market";

const patchSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  currency: z.enum(["USD", "BRL"]).optional(),
  defaultTimeframe: z.enum(TIMEFRAMES).optional(),
  autoRefreshSec: z.number().int().min(10).max(600).optional(),
  telegramChatId: z
    .string()
    .trim()
    .max(32)
    .regex(/^-?\d*$/, "Chat ID numérico")
    .nullable()
    .optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = requirePrisma();
  const pref = await prisma.userPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const db = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true, name: true, email: true, plan: true } });
  return ok({ preference: pref, telegramChatId: db?.telegramChatId ?? null, name: db?.name, email: db?.email, plan: db?.plan });
});

export const PATCH = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, patchSchema);
  const prisma = requirePrisma();
  const { telegramChatId, name, ...prefData } = body;
  const pref = await prisma.userPreference.upsert({ where: { userId: user.id }, update: prefData, create: { userId: user.id, ...prefData } });
  if (telegramChatId !== undefined || name !== undefined) {
    await prisma.user.update({ where: { id: user.id }, data: { ...(telegramChatId !== undefined ? { telegramChatId: telegramChatId || null } : {}), ...(name !== undefined ? { name } : {}) } });
  }
  return ok({ preference: pref });
});
