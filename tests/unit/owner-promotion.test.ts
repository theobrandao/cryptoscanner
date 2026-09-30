import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { OWNER_PASSWORD_PROMOTION_CUTOFF, shouldPromoteOwner } from "@/lib/owner-promotion";

const saved = process.env.OWNER_EMAILS;
beforeEach(() => {
  process.env.OWNER_EMAILS = "dono@example.com, outro-dono@example.com";
  resetEnvCache();
});
afterEach(() => {
  if (saved === undefined) delete process.env.OWNER_EMAILS;
  else process.env.OWNER_EMAILS = saved;
  resetEnvCache();
});

const before = new Date(OWNER_PASSWORD_PROMOTION_CUTOFF.getTime() - 60_000);
const after = new Date(OWNER_PASSWORD_PROMOTION_CUTOFF.getTime() + 60_000);

describe("Promoção de conta do dono (OWNER_EMAILS) a ADMIN", () => {
  it("e-mail que não é do dono nunca é promovido", () => {
    expect(shouldPromoteOwner({ email: "qualquer@example.com", via: "google", emailVerified: true, createdAt: before })).toBe(false);
    expect(shouldPromoteOwner({ email: "qualquer@example.com", via: "password", emailVerified: false, createdAt: before })).toBe(false);
  });
  it("Google com e-mail verificado promove o dono (sem diferenciar maiúsculas)", () => {
    expect(shouldPromoteOwner({ email: "Dono@Example.com", via: "google", emailVerified: true, createdAt: after })).toBe(true);
  });
  it("Google sem e-mail verificado não promove", () => {
    expect(shouldPromoteOwner({ email: "dono@example.com", via: "google", emailVerified: false, createdAt: before })).toBe(false);
  });
  it("login por senha não promove conta criada depois do corte (cadastro por terceiro com o e-mail do dono)", () => {
    expect(shouldPromoteOwner({ email: "dono@example.com", via: "password", emailVerified: false, createdAt: after })).toBe(false);
    expect(shouldPromoteOwner({ email: "dono@example.com", via: "password", emailVerified: false, createdAt: OWNER_PASSWORD_PROMOTION_CUTOFF })).toBe(false);
  });
  it("login por senha ainda promove as contas do dono criadas antes do corte", () => {
    expect(shouldPromoteOwner({ email: "outro-dono@example.com", via: "password", emailVerified: false, createdAt: before })).toBe(true);
  });
  it("sem OWNER_EMAILS ninguém é promovido", () => {
    process.env.OWNER_EMAILS = "";
    resetEnvCache();
    expect(shouldPromoteOwner({ email: "dono@example.com", via: "google", emailVerified: true, createdAt: before })).toBe(false);
  });
});
