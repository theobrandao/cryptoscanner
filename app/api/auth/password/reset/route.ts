import { connection } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requirePrisma } from "@/database/client";
import { ApiError, enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { hashPassword, passwordPolicy } from "@/lib/auth";
import { logAccess } from "@/services/access-log-service";

/** Define a nova senha com um token válido (60 min, uso único). Invalida os demais tokens do usuário. */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "password_reset");
  const body = await parseBody(req, z.object({ token: z.string().min(20).max(200), password: passwordPolicy }));
  const prisma = requirePrisma();
  const tokenHash = createHash("sha256").update(body.token).digest("hex");
  const pr = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!pr || pr.usedAt || pr.expiresAt < new Date()) throw new ApiError(400, "Link inválido ou expirado. Peça um novo.", "invalid_token");
  await prisma.$transaction([
    prisma.user.update({ where: { id: pr.userId }, data: { passwordHash: await hashPassword(body.password), passwordChangedAt: new Date() } }),
    prisma.passwordReset.updateMany({ where: { userId: pr.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  await logAccess(req, pr.userId, "password_reset");
  return ok({ reset: true });
});
