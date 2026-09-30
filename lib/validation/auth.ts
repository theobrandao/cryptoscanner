import { z } from "zod";
import { AUTH_MESSAGES } from "@/lib/validation/auth-messages";

/** Senha do cadastro com mensagens em português (mesma regra de `passwordPolicy` em lib/auth.ts). */
export const passwordSchema = z
  .string({ message: AUTH_MESSAGES.passwordRequired })
  .min(8, AUTH_MESSAGES.passwordShort)
  .max(128, AUTH_MESSAGES.passwordLong)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), AUTH_MESSAGES.passwordLettersNumbers);

const emailSchema = z.string({ message: AUTH_MESSAGES.emailInvalid }).trim().toLowerCase().email(AUTH_MESSAGES.emailInvalid);

/** Corpo do cadastro por e-mail e senha. */
export const registerSchema = z.object({
  name: z.string({ message: AUTH_MESSAGES.nameShort }).trim().min(2, AUTH_MESSAGES.nameShort).max(80, AUTH_MESSAGES.nameLong),
  email: emailSchema,
  password: passwordSchema,
  invite: z.string().trim().max(200, AUTH_MESSAGES.inviteLong).optional(),
  /** aceite explícito dos Termos, Privacidade e Reembolso (versão vigente gravada no usuário) */
  acceptTerms: z.literal(true, { message: AUTH_MESSAGES.termsRequired }),
});

/** Corpo do login por e-mail e senha. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ message: AUTH_MESSAGES.passwordRequired }).min(1, AUTH_MESSAGES.passwordRequired).max(128, AUTH_MESSAGES.passwordLong),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
