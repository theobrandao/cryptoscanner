import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ok, requireUser, withApi } from "@/lib/api";

/** Análises de imagem salvas do usuário. */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = requirePrisma();
  const items = await prisma.chartAnalysis.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, symbol: true, timeframe: true, provider: true, model: true, result: true, createdAt: true },
  });
  return ok({ items });
});
