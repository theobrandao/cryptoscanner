import { describe, expect, it } from "vitest";
import { AUTH_MESSAGES, fieldErrorsFromDetails, passwordMissing, validateAuthFields } from "@/lib/validation/auth-messages";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

describe("formulário de cadastro/login: erros em português por campo", () => {
  it("mostra o que falta na senha", () => {
    expect(passwordMissing("")).toEqual(["8 caracteres", "uma letra", "um número"]);
    expect(passwordMissing("abc")).toEqual(["mais 5 caracteres", "um número"]);
    expect(passwordMissing("abcdefg1")).toEqual([]);
    expect(passwordMissing("1234567")).toEqual(["mais 1 caractere", "uma letra"]);
  });

  it("traduz detalhes da API (inclusive texto padrão em inglês) para o campo certo", () => {
    const e = fieldErrorsFromDetails([
      { path: "email", message: "Invalid email address" },
      { path: "password", message: "mínimo de 8 caracteres" },
      { path: "acceptTerms", message: AUTH_MESSAGES.termsRequired },
      { path: "outro", message: "x" },
    ]);
    expect(e.email).toBe(AUTH_MESSAGES.emailInvalid);
    expect(e.password).toMatch(/8 caracteres/);
    expect(e.acceptTerms).toBe("Marque o aceite para continuar.");
    expect(Object.keys(e)).toEqual(["email", "password", "acceptTerms"]);
    expect(fieldErrorsFromDetails(undefined)).toEqual({});
  });

  it("validação local segue as regras do servidor", () => {
    expect(validateAuthFields("register", { name: "A", email: "x", password: "abc", accept: false })).toEqual({
      name: AUTH_MESSAGES.nameShort,
      email: AUTH_MESSAGES.emailInvalid,
      password: AUTH_MESSAGES.passwordShort,
      acceptTerms: AUTH_MESSAGES.termsRequired,
    });
    expect(validateAuthFields("register", { name: "Ana", email: "ana@example.com", password: "abcdefgh", accept: true })).toEqual({ password: AUTH_MESSAGES.passwordLettersNumbers });
    expect(validateAuthFields("register", { name: "Ana", email: "ana@example.com", password: "abcdefg1", accept: true })).toEqual({});
    expect(validateAuthFields("login", { name: "", email: "ana@example.com", password: "", accept: false })).toEqual({ password: AUTH_MESSAGES.passwordRequired });
  });

  it("schemas zod devolvem as mesmas mensagens em português", () => {
    const r = registerSchema.safeParse({ name: "A", email: "nao-e-email", password: "abcdefgh", acceptTerms: false });
    expect(r.success).toBe(false);
    const msgs = Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
    expect(msgs).toEqual({ name: AUTH_MESSAGES.nameShort, email: AUTH_MESSAGES.emailInvalid, password: AUTH_MESSAGES.passwordLettersNumbers, acceptTerms: AUTH_MESSAGES.termsRequired });
    expect(fieldErrorsFromDetails(r.error?.issues.map((i) => ({ path: i.path.join("."), message: i.message })))).toEqual(msgs);
    expect(loginSchema.safeParse({ email: " Ana@Example.com ", password: "x" })).toMatchObject({ success: true, data: { email: "ana@example.com" } });
  });
});
