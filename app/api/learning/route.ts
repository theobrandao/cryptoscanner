import { connection } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ok, parseBody, requireUser, withApi } from "@/lib/api";
import { LESSONS } from "@/lib/content/lessons";

const progressSchema = z.record(z.string(), z.object({ done: z.boolean(), score: z.number().int().min(0).max(10), at: z.string() }));

/** Progresso da Jornada Trader do usuário. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const pref = await requirePrisma().userPreference.findUnique({ where: { userId: user.id }, select: { learning: true } });
  return ok({ progress: (pref?.learning as Record<string, unknown> | null) ?? {}, total: LESSONS.length });
});

/** Substitui o progresso (mesclado com o existente). */
export const PATCH = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ progress: progressSchema }));
  const known = new Set(LESSONS.map((l) => l.slug));
  const filtered = Object.fromEntries(Object.entries(body.progress).filter(([k]) => known.has(k)));
  const prisma = requirePrisma();
  const current = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { learning: true } });
  const merged = { ...((current?.learning as Record<string, unknown> | null) ?? {}), ...filtered } as Prisma.InputJsonValue;
  const pref = await prisma.userPreference.upsert({ where: { userId: user.id }, update: { learning: merged }, create: { userId: user.id, learning: merged } });
  return ok({ progress: pref.learning ?? {} });
});
