import { connection } from "next/server";
import { checkDatabase } from "@/database/client";
import { ok, withApi } from "@/lib/api";
import { getCache } from "@/lib/cache";
import { getEnv, isLlmConfigured, isTelegramConfigured } from "@/lib/env";
import { getProviderHealth } from "@/services/market/market-service";

export const GET = withApi(async () => {
  await connection();
  const env = getEnv();
  const [db, providers] = await Promise.all([checkDatabase(), getProviderHealth()]);
  return ok({
    status: "ok",
    time: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    // commit em produção (Vercel) — o CI espera este valor igualar o commit testado antes do smoke
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    database: db,
    cache: getCache().kind(),
    providers,
    llm: { configured: isLlmConfigured(), provider: env.LLM_PROVIDER },
    telegram: { configured: isTelegramConfigured() },
  });
});
