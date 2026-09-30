import { isOwnerEmail } from "@/lib/env";

/**
 * Corte da promoção por senha. Antes desta correção, qualquer pessoa podia cadastrar com senha um e-mail de OWNER_EMAILS
 * ainda sem conta e virar ADMIN (o cadastro não prova que a pessoa controla o e-mail). Agora o cadastro por senha de e-mail
 * do dono é recusado e o login por senha não promove mais — exceto as contas criadas antes deste instante, que são as contas
 * do dono já existentes (criadas por ele) e que continuam entrando por senha como ADMIN. Conta criada depois só vira ADMIN
 * pelo login com Google (e-mail verificado).
 */
export const OWNER_PASSWORD_PROMOTION_CUTOFF = new Date("2026-09-30T18:00:00Z");

export interface OwnerPromotionInput {
  email: string;
  via: "password" | "google";
  /** e-mail verificado pelo provedor (Google: claim email_verified) */
  emailVerified: boolean;
  createdAt: Date;
}

/** Decide se a conta deve virar ADMIN + PLATINUM por ser do dono. Não rebaixa ninguém: quem já é ADMIN continua ADMIN. */
export function shouldPromoteOwner(input: OwnerPromotionInput): boolean {
  if (!isOwnerEmail(input.email)) return false;
  if (input.via === "google") return input.emailVerified;
  return input.createdAt.getTime() < OWNER_PASSWORD_PROMOTION_CUTOFF.getTime();
}
