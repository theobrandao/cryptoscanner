import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { assertCronAuth, recordCronRun, withCronLock } from "@/lib/cron";
import { createLogger } from "@/lib/logger";
import { evaluateAlerts } from "@/services/alert-service";
import { runScan } from "@/services/scanner-service";
import { runAllActiveAgents } from "@/services/user-agent-service";
import { persistMarketSnapshot } from "@/worker/persist";

const log = createLogger("cron");

/** Limite de execução (segundos) na Vercel (plano Pro). */
export const maxDuration = 120;

/**
 * Ciclo do worker exposto como endpoint HTTP — para hospedagens serverless (Vercel) sem processo
 * de longa duração. Agendado a cada 5 min pelo Vercel Cron (vercel.json); um agendador externo (QStash,
 * cron-job.org) pode chamar também com `Authorization: Bearer <CRON_SECRET>` — a trava evita execução dupla.
 * Etapas: scan 4H/1D → snapshot de mercado → agentes do usuário → alertas → monitores → sinais de padrão ao vivo.
 */
async function handle(req: Request) {
  await connection();
  assertCronAuth(req);
  const res = await withCronLock("cycle", maxDuration, () => runCycle());
  return res ?? ok({ skipped: "running" });
}

async function runCycle() {
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

  const scans: Awaited<ReturnType<typeof runScan>>[] = [];
  await step("scan", async () => {
    const out: Record<string, unknown> = {};
    for (const tf of ["4h", "1d"] as const) {
      const r = await runScan({ timeframe: tf, includeVolume: tf === "4h", refresh: true });
      scans.push(r);
      out[tf] = { rows: r.rows.length, patterns: r.rows.reduce((s, x) => s + x.patterns.length, 0), volumeAlerts: r.volumeAlerts.length, sources: r.sources };
    }
    return out;
  });
  await step("market-snapshot", () => persistMarketSnapshot({ candlesPerAsset: 50, timeBudgetMs: 25_000 }));
  await step("user-agents", async () => {
    const res = await runAllActiveAgents();
    return { agents: res.length, signals: res.reduce((s, r) => s + r.signals.length, 0), alertsSent: res.reduce((s, r) => s + r.alertsSent, 0) };
  });
  await step("alerts", () => evaluateAlerts());

  // Market Monitor: usa o tempo que sobrar do ciclo (endpoint dedicado /api/cron/monitors cobre o restante)
  await step("monitors", async () => {
    const { evaluateMonitors } = await import("@/services/monitor-service");
    return evaluateMonitors({ budgetMs: Math.max(5_000, 95_000 - (Date.now() - t0)) });
  });

  await step("lifecycle", async () => {
    const { runLifecycle } = await import("@/services/lifecycle-service");
    return runLifecycle();
  });

  await step("pattern-signals", async () => {
    const { trackLiveSignals } = await import("@/services/pattern-stats-service");
    return trackLiveSignals(scans);
  });

  log.info("ciclo via HTTP concluído", { ms: Date.now() - t0 });
  const failed = Object.entries(steps).filter(([, v]) => !(v as { ok: boolean }).ok).map(([k]) => k);
  // o ciclo só é considerado falho se o scan (etapa principal) falhar ou se 2+ etapas falharem
  await recordCronRun("cycle", t0, { ok: !failed.includes("scan") && failed.length < 2, detail: { failed, durationMs: Date.now() - t0 } });
  return ok({ ranAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, steps });
}

export const GET = withApi(handle);
export const POST = withApi(handle);
