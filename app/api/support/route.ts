import { connection } from "next/server";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { enforceRateLimit, ok, parseBody, requireUser, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email(), subject: z.string().trim().min(3).max(120), message: z.string().trim().min(10).max(4000) });

export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "auth");
  const body = await parseBody(req, bodySchema);
  const user = await getSessionFromRequest(req);
  const ticket = await requirePrisma().supportTicket.create({ data: { ...body, userId: user?.id ?? null } });
  return ok({ id: ticket.id, createdAt: ticket.createdAt });
});

/** Chamados do usuário autenticado (mais recentes primeiro). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const items = await requirePrisma().supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, subject: true, message: true, status: true, createdAt: true },
  });
  return ok({ items });
});
