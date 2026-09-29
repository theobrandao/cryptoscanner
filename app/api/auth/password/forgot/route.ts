import { connection } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/database/client";
import { enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { isEmailConfigured, sendTemplate } from "@/services/email-service";
import { track } from "@/services/analytics-service";

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
  if (prisma && user) {
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const url = `${getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/redefinir-senha?token=${token}`;
    await sendTemplate("password_reset", { to: user.email, name: user.name, url });
    await track("password_reset_requested", { userId: user.id });
  }
  return ok({ accepted: true, emailEnabled: isEmailConfigured() });
});
