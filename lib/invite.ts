import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/** Compara o código de convite em tempo constante. Sem código configurado, o cadastro é aberto. */
export function checkInvite(provided: string | undefined): boolean {
  const expected = getEnv().REGISTRATION_INVITE_CODE;
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
