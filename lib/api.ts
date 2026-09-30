import type { Subscription } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionFromRequest, type SessionUser } from "@/lib/auth";
import { DatabaseUnavailableError } from "@/database/client";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { clientIp, flowConfig, rateLimit, rateLimitHeaders, type RateLimitFlow, type RateLimitResult } from "@/lib/rate-limit";

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
    /** cabeçalhos extras da resposta de erro (ex.: Retry-After no 429) */
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Texto único para falhas de infraestrutura (banco, Redis, provedores): a causa vai só para o log. */
export const UNAVAILABLE_MESSAGE = "Serviço temporariamente indisponível. Tente em instantes.";

/** Cabeçalho para respostas com dados do usuário (não guardar em cache compartilhado nem no navegador). */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

/** `ok` com Cache-Control: no-store (resposta com dado do usuário). */
export function okPrivate<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init, headers: { ...NO_STORE, ...(init?.headers as Record<string, string> | undefined) } });
}

export function fail(status: number, message: string, code = "error", details?: unknown, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Rótulos em português dos campos mais comuns (detalhe de validação). */
const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  password: "Senha",
  invite: "Código de convite",
  acceptTerms: "Aceite dos termos",
  token: "Link de redefinição",
  confirm: "Confirmação",
  symbol: "Ativo",
  symbols: "Ativos",
  timeframe: "Tempo gráfico",
  tf: "Tempo gráfico",
  message: "Mensagem",
  subject: "Assunto",
  threshold: "Valor",
  telegramChatId: "Chat ID do Telegram",
  minConfidence: "Confiança mínima",
  minScore: "Pontuação mínima",
  strategyId: "Estratégia",
  days: "Dias",
  limit: "Quantidade",
  exchange: "Corretora",
  instrument: "Instrumento",
  question: "Pergunta",
};

const ENGLISH_DEFAULT = /^(Invalid|Too (small|big)|Expected|Unrecognized|Required|Input not instance|Number must|String must)/;

type LooseIssue = ZodError["issues"][number] & { minimum?: number | bigint; maximum?: number | bigint; origin?: string; input?: unknown; format?: string };

/** Mensagem em português para um problema de validação (mantém as mensagens próprias dos schemas). */
export function validationMessage(issue: LooseIssue): string {
  if (!ENGLISH_DEFAULT.test(issue.message)) return issue.message;
  const n = (v: number | bigint | undefined) => (v === undefined ? "" : String(v));
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? "Campo obrigatório." : "Valor em formato inválido.";
    case "invalid_format":
      return issue.format === "email" ? "Informe um e-mail válido." : "Formato inválido.";
    case "too_small":
      if (issue.origin === "string") return `Use pelo menos ${n(issue.minimum)} caractere${Number(issue.minimum) === 1 ? "" : "s"}.`;
      if (issue.origin === "array" || issue.origin === "set") return `Escolha pelo menos ${n(issue.minimum)} ${Number(issue.minimum) === 1 ? "item" : "itens"}.`;
      return `O valor mínimo é ${n(issue.minimum)}.`;
    case "too_big":
      if (issue.origin === "string") return `Use no máximo ${n(issue.maximum)} caracteres.`;
      if (issue.origin === "array" || issue.origin === "set") return `Escolha no máximo ${n(issue.maximum)} itens.`;
      return `O valor máximo é ${n(issue.maximum)}.`;
    case "invalid_value":
      return "Opção inválida.";
    case "unrecognized_keys":
      return "Campo não reconhecido.";
    default:
      return "Valor inválido.";
  }
}

/** Detalhes de validação: `path` (chave do campo), `field` (rótulo em português) e `message` em português. */
export function validationDetails(err: ZodError): Array<{ path: string; field: string; message: string }> {
  return err.issues.map((i) => {
    const path = i.path.join(".");
    const last = String(i.path[i.path.length - 1] ?? "");
    return { path, field: FIELD_LABELS[last] ?? FIELD_LABELS[path] ?? (path || "Dados"), message: validationMessage(i as LooseIssue) };
  });
}

const PRISMA_UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

/** Falha de infraestrutura (banco fora do ar, provedores de mercado, Redis): vira 503 com texto fixo. */
export function isUnavailableError(err: unknown): boolean {
  if (err instanceof DatabaseUnavailableError) return true;
  if (!(err instanceof Error)) return false;
  if (err.name === "PrismaClientInitializationError" || err.name === "PrismaClientRustPanicError") return true;
  if (err.name === "PrismaClientKnownRequestError" && PRISMA_UNAVAILABLE_CODES.has(String((err as { code?: string }).code))) return true;
  if (err.name === "ProviderError" || err.name === "HttpError") return true;
  return err.message.startsWith("Todos os provedores falharam");
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) return fail(err.status, err.message, err.code, err.details, err.headers);
  if (err instanceof ZodError) {
    const details = validationDetails(err);
    const message = details.length === 1 ? `${details[0]!.field}: ${details[0]!.message}` : "Confira os dados informados.";
    return fail(400, message, "validation", details);
  }
  if (isUnavailableError(err)) {
    log.error("serviço indisponível", { error: err });
    const code = err instanceof DatabaseUnavailableError || (err instanceof Error && err.name.startsWith("PrismaClient")) ? "database_unavailable" : "provider_unavailable";
    return fail(503, UNAVAILABLE_MESSAGE, code);
  }
  const message = err instanceof Error ? err.message : String(err);
  log.error("erro não tratado", { error: err });
  const safe = getEnv().NODE_ENV === "production" ? "Algo deu errado. Tente novamente em instantes." : message;
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

export const BLOCKED_MESSAGE = "Conta bloqueada. Fale com o suporte.";

/** Linha de acesso lida junto com a sessão (evita reler usuário + assinatura em `getAccess`). */
export interface UserAccessRow {
  role: SessionUser["role"];
  plan: SessionUser["plan"];
  subscription: Subscription | null;
}
const accessRows = new WeakMap<SessionUser, UserAccessRow>();

/** Linha lida por `requireUser` para este objeto de sessão (se houver banco). */
export function accessRowFor(user: SessionUser): UserAccessRow | undefined {
  return accessRows.get(user);
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getSessionFromRequest(req);
  if (!user) throw new ApiError(401, "Faça login para usar este recurso", "unauthorized");
  // plano e papel relidos do banco: o JWT vale 7 dias e não pode carregar acesso desatualizado
  const prisma = getPrisma();
  if (prisma) {
    const db = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true, role: true, email: true, name: true, passwordChangedAt: true, blockedAt: true, subscription: true } });
    if (!db) throw new ApiError(401, "Sessão inválida", "unauthorized");
    // conta bloqueada pelo administrador
    if (db.blockedAt) throw new ApiError(403, BLOCKED_MESSAGE, "account_blocked");
    // senha trocada depois da emissão do token: sessão antiga deixa de valer
    if (db.passwordChangedAt && user.iat != null && user.iat * 1000 < db.passwordChangedAt.getTime() - 1000) throw new ApiError(401, "Sessão encerrada após troca de senha. Entre novamente.", "unauthorized");
    const out: SessionUser = { ...user, plan: db.plan, role: db.role, email: db.email, name: db.name };
    accessRows.set(out, { role: db.role, plan: db.plan, subscription: db.subscription ?? null });
    return out;
  }
  return user;
}

/** Usuário logado com papel ADMIN (relido do banco); os demais recebem 403. */
export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new ApiError(403, "Acesso restrito ao administrador", "forbidden");
  return user;
}

/** Mensagem do 429, com a espera real até a janela reabrir. */
export function rateLimitedMessage(retryAfterSeconds: number): string {
  return `Muitas tentativas. Aguarde ${retryAfterSeconds} s e tente de novo.`;
}

/**
 * Limite de taxa por fluxo (balde próprio em `lib/rate-limit.ts`). Chave padrão: IP do cliente.
 * 429 leva Retry-After e X-RateLimit-*; fluxo estrito sem Redis em produção responde 503 (e registra no log).
 */
export async function enforceRateLimit(req: Request, bucket: RateLimitFlow, keyOverride?: string): Promise<RateLimitResult> {
  const cfg = flowConfig(bucket);
  const res = await rateLimit(bucket, keyOverride ?? clientIp(req), cfg.limit, { windowSeconds: cfg.windowSeconds, strict: cfg.strict });
  if (!res.available) throw new ApiError(503, UNAVAILABLE_MESSAGE, "service_unavailable");
  if (!res.allowed) {
    throw new ApiError(429, rateLimitedMessage(res.retryAfterSeconds), "rate_limited", { resetAt: res.resetAt, retryAfter: res.retryAfterSeconds, limit: res.limit }, rateLimitHeaders(res, true));
  }
  return res;
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
