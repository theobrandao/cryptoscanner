import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { PlanKey } from "@/lib/plans";

/**
 * Autenticação própria: e-mail + senha (bcrypt) e sessão em JWT assinado (HS256)
 * guardado em cookie httpOnly. Sem dependência de provedores externos.
 */
export const SESSION_COOKIE = "cs_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  plan: PlanKey;
  role: "USER" | "ADMIN";
  /** emissão do JWT (segundos) — comparada com passwordChangedAt */
  iat?: number;
}

const sessionSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string(),
  plan: z.enum(["FREE", "PRO", "PLATINUM"]),
  role: z.enum(["USER", "ADMIN"]),
});

function secretKey(): Uint8Array {
  const secret = getEnv().AUTH_SECRET;
  if (!secret) {
    if (getEnv().NODE_ENV === "production") throw new Error("AUTH_SECRET obrigatório em produção");
    return new TextEncoder().encode("dev-secret-inseguro-somente-para-desenvolvimento-local!!");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const days = getEnv().AUTH_SESSION_DAYS;
  return new SignJWT({ email: user.email, name: user.name, plan: user.plan, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const parsed = sessionSchema.safeParse(payload);
    if (!parsed.success) return null;
    return { id: parsed.data.sub, email: parsed.data.email, name: parsed.data.name, plan: parsed.data.plan, role: parsed.data.role, iat: typeof payload.iat === "number" ? payload.iat : undefined };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const days = getEnv().AUTH_SESSION_DAYS;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  };
}

/** Lê a sessão a partir do cookie (Server Components e Route Handlers). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(req: Request): Promise<SessionUser | null> {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  return verifySessionToken(token);
}

export const passwordPolicy = z
  .string()
  .min(8, "mínimo de 8 caracteres")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "use letras e números");
