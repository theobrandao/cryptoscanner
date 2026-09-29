import { timingSafeEqual } from "node:crypto";
import { getEnv, isOwnerEmail } from "@/lib/env";

/**
 * Autoriza o cadastro. REGISTRATION_MODE=open libera para todos (venda). Em "invite" (uso pessoal):
 *  - e-mail listado em OWNER_EMAILS: sempre autorizado;
 *  - REGISTRATION_INVITE_CODE definido: exige o código (comparação em tempo constante);
 *  - só OWNER_EMAILS definido: ninguém além do dono;
 *  - nada definido: cadastro aberto (desenvolvimento).
 */
export function canRegister(email: string, provided: string | undefined): boolean {
  if (isOwnerEmail(email)) return true;
  const env = getEnv();
  // venda aberta: qualquer e-mail inicia o teste de 7 dias
  if (env.REGISTRATION_MODE === "open") return true;
  const expected = env.REGISTRATION_INVITE_CODE;
  if (!expected) return env.OWNER_EMAILS.trim().length === 0;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
