/**
 * Textos e regras do formulário de entrar/cadastro, sem zod (pode ir para o navegador sem pesar o pacote).
 * Os schemas do servidor ficam em `lib/validation/auth.ts` e usam as mesmas mensagens.
 */

export type AuthField = "name" | "email" | "password" | "invite" | "acceptTerms";

/** Rótulo do campo como aparece na tela. */
export const AUTH_FIELD_LABELS: Record<AuthField, string> = {
  name: "Nome",
  email: "E-mail",
  password: "Senha",
  invite: "Código de convite",
  acceptTerms: "Aceite",
};

export const AUTH_MESSAGES = {
  nameShort: "Use pelo menos 2 letras.",
  nameLong: "Use no máximo 80 caracteres.",
  emailInvalid: "Informe um e-mail válido, como nome@exemplo.com.",
  passwordRequired: "Informe a senha.",
  passwordShort: "Use pelo menos 8 caracteres.",
  passwordLong: "Use no máximo 128 caracteres.",
  passwordLettersNumbers: "Use letras e números.",
  inviteLong: "Código muito longo.",
  termsRequired: "Marque o aceite para continuar.",
} as const;

/** Mensagem padrão por campo, usada quando o servidor devolve texto fora do padrão (ex.: mensagem em inglês). */
const FALLBACK: Record<AuthField, string> = {
  name: "Confira o nome (de 2 a 80 caracteres).",
  email: AUTH_MESSAGES.emailInvalid,
  password: "Confira a senha: mínimo de 8 caracteres, com letras e números.",
  invite: "Confira o código de convite.",
  acceptTerms: AUTH_MESSAGES.termsRequired,
};

const KNOWN = new Set<string>(Object.values(AUTH_MESSAGES));

function isAuthField(path: string): path is AuthField {
  return path in AUTH_FIELD_LABELS;
}

/** O que ainda falta na senha do cadastro (lista vazia = senha atende à regra). */
export function passwordMissing(password: string): string[] {
  const out: string[] = [];
  if (password.length < 8) out.push(password.length === 0 ? "8 caracteres" : `mais ${8 - password.length} caractere${8 - password.length === 1 ? "" : "s"}`);
  if (!/[A-Za-z]/.test(password)) out.push("uma letra");
  if (!/\d/.test(password)) out.push("um número");
  return out;
}

/**
 * Converte os detalhes de validação da API (`[{ path, message }]`) em erros por campo, em português.
 * Detalhe de campo desconhecido fica de fora (a mensagem geral da API já aparece no alerta).
 */
export function fieldErrorsFromDetails(details: unknown): Partial<Record<AuthField, string>> {
  const out: Partial<Record<AuthField, string>> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const path = String((d as { path?: unknown }).path ?? "");
    const message = String((d as { message?: unknown }).message ?? "");
    if (!isAuthField(path) || out[path]) continue;
    out[path] = KNOWN.has(message) ? message : FALLBACK[path];
  }
  return out;
}

/** Validação local antes de enviar (mesmas regras do servidor). */
export function validateAuthFields(mode: "login" | "register", v: { name: string; email: string; password: string; accept: boolean }): Partial<Record<AuthField, string>> {
  const out: Partial<Record<AuthField, string>> = {};
  const email = v.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = AUTH_MESSAGES.emailInvalid;
  if (mode === "login") {
    if (!v.password) out.password = AUTH_MESSAGES.passwordRequired;
    return out;
  }
  const name = v.name.trim();
  if (name.length < 2) out.name = AUTH_MESSAGES.nameShort;
  else if (name.length > 80) out.name = AUTH_MESSAGES.nameLong;
  if (v.password.length > 128) out.password = AUTH_MESSAGES.passwordLong;
  else if (v.password.length < 8) out.password = AUTH_MESSAGES.passwordShort;
  else if (passwordMissing(v.password).length) out.password = AUTH_MESSAGES.passwordLettersNumbers;
  if (!v.accept) out.acceptTerms = AUTH_MESSAGES.termsRequired;
  return out;
}
