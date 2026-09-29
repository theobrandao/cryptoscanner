import { afterEach, describe, expect, it } from "vitest";
import { isInviteRequired, isRegistrationOpen, legalDocKind, resetEnvCache } from "@/lib/env";
import { canRegister } from "@/lib/invite";

const KEYS = ["REGISTRATION_MODE", "REGISTRATION_INVITE_CODE", "OWNER_EMAILS", "LEGAL_ENTITY_NAME", "LEGAL_ENTITY_DOC", "LEGAL_ENTITY_ADDRESS", "SUPPORT_EMAIL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function setEnv(v: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
  resetEnvCache();
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  resetEnvCache();
});

describe("Cadastro aberto exige fornecedor identificado", () => {
  const entity = { LEGAL_ENTITY_NAME: "Fulano de Tal", LEGAL_ENTITY_DOC: "000.000.000-00", LEGAL_ENTITY_ADDRESS: "Rua X, 1", SUPPORT_EMAIL: "suporte@example.com" };
  it("open sem dados do fornecedor continua por convite", () => {
    setEnv({ REGISTRATION_MODE: "open", REGISTRATION_INVITE_CODE: "codigo-123" });
    expect(isRegistrationOpen()).toBe(false);
    expect(isInviteRequired()).toBe(true);
    expect(canRegister("a@b.com", undefined)).toBe(false);
    expect(canRegister("a@b.com", "codigo-123")).toBe(true);
  });
  it("open com fornecedor completo libera qualquer e-mail", () => {
    setEnv({ REGISTRATION_MODE: "open", REGISTRATION_INVITE_CODE: "codigo-123", ...entity });
    expect(isRegistrationOpen()).toBe(true);
    expect(isInviteRequired()).toBe(false);
    expect(canRegister("a@b.com", undefined)).toBe(true);
  });
  it("tipo do documento pelo número de dígitos", () => {
    expect(legalDocKind("123.456.789-01")).toBe("CPF");
    expect(legalDocKind("59.520.011/0001-45")).toBe("CNPJ");
    expect(legalDocKind(undefined)).toBeNull();
    expect(legalDocKind("abc")).toBeNull();
  });
});
