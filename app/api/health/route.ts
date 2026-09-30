import { connection } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { checkDatabase } from "@/database/client";
import { okPrivate, requireAdmin, withApi } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { getCache } from "@/lib/cache";
import { getEnv, isLlmConfigured, isTelegramConfigured } from "@/lib/env";
import { getProviderHealth } from "@/services/market/market-service";

/** Comparação em tempo constante (digests de mesmo tamanho: não vaza o comprimento do segredo). */
function secretMatches(provided: string, secret: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Detalhe só para o monitoramento (cabeçalho x-health-secret = CRON_SECRET) ou para o administrador logado. */
async function canSeeDetail(req: Request): Promise<boolean> {
  const secret = getEnv().CRON_SECRET;
  const provided = req.headers.get("x-health-secret");
  if (secret && provided && secretMatches(provided, secret)) return true;
  const session = await getSessionFromRequest(req);
  if (session?.role !== "ADMIN") return false;
  try {
    await requireAdmin(req);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saúde do serviço. Público: só `status` e `database.ok` (mais `commit`, que o CI usa para esperar o deploy, e
 * `llm.configured`, que a tela de análise de gráfico lê). Sem mensagem do banco, provedores ou versão.
 * Detalhado (banco, cache, provedores, IA, Telegram): admin ou `x-health-secret`.
 */
export const GET = withApi(async (req) => {
  await connection();
  const db = await checkDatabase();
  const status = db.ok || !db.configured ? "ok" : "degraded";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  if (!(await canSeeDetail(req))) {
    return okPrivate({ status, database: { ok: db.ok }, commit, llm: { configured: isLlmConfigured() } });
  }
  const env = getEnv();
  const providers = await getProviderHealth();
  return okPrivate({
    status,
    time: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    commit,
    database: db,
    cache: getCache().kind(),
    providers,
    llm: { configured: isLlmConfigured(), provider: env.LLM_PROVIDER },
    telegram: { configured: isTelegramConfigured() },
  });
});
