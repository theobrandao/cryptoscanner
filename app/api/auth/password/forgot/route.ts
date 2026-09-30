import { connection } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/database/client";
import { enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { isEmailConfigured } from "@/services/email-service";
import { sendPasswordResetLink } from "@/services/password-reset-service";

/**
 * Pede a redefinição de senha. Resposta idêntica exista ou não o e-mail (sem enumeração de contas).
 * Token aleatório de 32 bytes; no banco só o SHA-256; validade 60 min; uso único.
 */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "auth");
  const { email } = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email() }));
  const prisma = getPrisma();
  const user = prisma ? await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } }) : null;
  if (prisma && user) await sendPasswordResetLink(user);
  return ok({ accepted: true, emailEnabled: isEmailConfigured() });
});
