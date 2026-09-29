import { getPrisma } from "@/database/client";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionFromRequest, type SessionUser } from "@/lib/auth";
import { DatabaseUnavailableError } from "@/database/client";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const log = createLogger("api");

/**
 * Utilitários para route handlers: respostas padronizadas, validação, autenticação,
 * rate limiting e tratamento seguro de erros (nunca vaza stack para o cliente).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "error",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(status: number, message: string, code = "error", details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) return fail(err.status, err.message, err.code, err.details);
  if (err instanceof ZodError) {
    return fail(
      400,
      "Parâmetros inválidos",
      "validation",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (err instanceof DatabaseUnavailableError) return fail(503, err.message, "database_unavailable");
  const message = err instanceof Error ? err.message : String(err);
  log.error("erro não tratado", { error: err });
  const safe = getEnv().NODE_ENV === "production" ? "Erro interno" : message;
  return fail(500, safe, "internal");
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "Corpo da requisição deve ser JSON", "invalid_json");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const existing = obj[k];
    if (existing === undefined) obj[k] = v;
    else obj[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
  }
  return schema.parse(obj);
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getSessionFromRequest(req);
  if (!user) throw new ApiError(401, "Faça login para usar este recurso", "unauthorized");
  // plano e papel relidos do banco: o JWT vale 7 dias e não pode carregar acesso desatualizado
  const prisma = getPrisma();
  if (prisma) {
    const db = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true, role: true, email: true, name: true, passwordChangedAt: true } });
    if (!db) throw new ApiError(401, "Sessão inválida", "unauthorized");
    // senha trocada depois da emissão do token: sessão antiga deixa de valer
    if (db.passwordChangedAt && user.iat != null && user.iat * 1000 < db.passwordChangedAt.getTime() - 1000) throw new ApiError(401, "Sessão encerrada após troca de senha. Entre novamente.", "unauthorized");
    return { ...user, plan: db.plan, role: db.role, email: db.email, name: db.name };
  }
  return user;
}

export async function enforceRateLimit(req: Request, bucket: "public" | "auth" | "llm", keyOverride?: string): Promise<void> {
  const env = getEnv();
  const limit = bucket === "public" ? env.RATE_LIMIT_PUBLIC_PER_MINUTE : bucket === "auth" ? env.RATE_LIMIT_AUTH_PER_MINUTE : env.RATE_LIMIT_LLM_PER_MINUTE;
  const res = await rateLimit(bucket, keyOverride ?? clientIp(req), limit);
  if (!res.allowed) {
    throw new ApiError(429, `Limite de ${res.limit} requisições por minuto excedido. Tente novamente em instantes.`, "rate_limited", { resetAt: res.resetAt });
  }
}

/** Envolve um handler com tratamento de erro padrão. */
export function withApi(handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return handleError(err);
    }
  };
}
