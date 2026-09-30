import { createHash, randomBytes } from "node:crypto";
import { requirePrisma } from "@/database/client";
import { getEnv } from "@/lib/env";
import { isEmailConfigured, sendTemplate } from "@/services/email-service";
import { track } from "@/services/analytics-service";

/**
 * Cria o link de redefinição de senha e envia por e-mail (token aleatório de 32 bytes; no banco só o SHA-256;
 * validade 60 min; uso único). Usado por "Esqueci minha senha" e pelo Painel de controle.
 */
export async function sendPasswordResetLink(user: { id: string; name: string; email: string }): Promise<{ emailEnabled: boolean }> {
  const prisma = requirePrisma();
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  const url = `${getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/redefinir-senha?token=${token}`;
  await sendTemplate("password_reset", { to: user.email, name: user.name, url });
  await track("password_reset_requested", { userId: user.id });
  return { emailEnabled: isEmailConfigured() };
}
