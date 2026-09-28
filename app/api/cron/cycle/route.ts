import { connection } from "next/server";
import { ApiError, ok, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { evaluateAlerts } from "@/services/alert-service";
import { runScan } from "@/services/scanner-service";
import { runAllActiveAgents } from "@/services/user-agent-service";
import { persistMarketSnapshot } from "@/worker/persist";

const log = createLogger("cron");

/** Limite de execução (segundos) para plataformas serverless (Vercel). */
export const maxDuration = 60;

/**
 * Ciclo do worker exposto como endpoint HTTP — para hospedagens serverless (Vercel) sem processo
 * de longa duração. Deve ser chamado a cada 5 min por um agendador externo (QStash, cron-job.org,
 * Vercel Cron) com `Authorization: Bearer <CRON_SECRET>` ou `?secret=<CRON_SECRET>`.
 * Etapas: scan 4H/1D → snapshot de mercado → agentes do usuário → alertas.
 */
async function handle(req: Request) {
  await connection();
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new ApiError(503, "CRON_SECRET não configurado", "cron_disabled");
  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (provided !== secret) throw new ApiError(401, "Segredo inválido", "unauthorized");

  const t0 = Date.now();
  const steps: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const s = Date.now();
    try {
      steps[name] = { ok: true, result: await fn(), ms: Date.now() - s };
    } catch (err) {
      steps[name] = { ok: false, error: (err as Error).message, ms: Date.now() - s };
      log.error(`etapa ${name} falhou`, { error: (err as Error).message });
    }
  };

  await step("scan", async () => {
    const out: Record<string, unknown> = {};
    for (const tf of ["4h", "1d"] as const) {
      const r = await runScan({ timeframe: tf, includeVolume: tf === "4h", refresh: true });
      out[tf] = { rows: r.rows.length, patterns: r.rows.reduce((s, x) => s + x.patterns.length, 0), volumeAlerts: r.volumeAlerts.length, sources: r.sources };
    }
    return out;
  });
  await step("market-snapshot", () => persistMarketSnapshot({ candlesPerAsset: 12, timeBudgetMs: 20_000 }));
  await step("user-agents", async () => {
    const res = await runAllActiveAgents();
    return { agents: res.length, signals: res.reduce((s, r) => s + r.signals.length, 0), alertsSent: res.reduce((s, r) => s + r.alertsSent, 0) };
  });
  await step("alerts", () => evaluateAlerts());

  log.info("ciclo via HTTP concluído", { ms: Date.now() - t0 });
  return ok({ ranAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, steps });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
