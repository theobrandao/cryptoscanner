import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { assertCronAuth, Deadline, recordCronRun, withCronLock } from "@/lib/cron";
import { createLogger } from "@/lib/logger";
import { evaluateAlerts } from "@/services/alert-service";
import { runScan } from "@/services/scanner-service";
import { runAllActiveAgents } from "@/services/user-agent-service";
import { persistMarketSnapshot } from "@/worker/persist";

const log = createLogger("cron");

/** Limite de execução (segundos) na Vercel (plano Pro). */
export const maxDuration = 120;

/** Orçamento do ciclo: abaixo de maxDuration para sobrar tempo ao registro da execução e à resposta. */
const CYCLE_BUDGET_MS = 110_000;
/** Tempo mínimo restante para cada etapa começar (o que sobra fica para as etapas seguintes). */
const MIN_REMAINING_MS = { snapshot: 60_000, patternSignals: 45_000, agents: 40_000, alerts: 28_000, monitors: 30_000, lifecycle: 12_000, retention: 8_000 } as const;

/**
 * Ciclo do worker exposto como endpoint HTTP — para hospedagens serverless (Vercel) sem processo
 * de longa duração. Agendado a cada 5 min pelo Vercel Cron (vercel.json); um agendador externo (QStash,
 * cron-job.org) pode chamar também com `Authorization: Bearer <CRON_SECRET>` — a trava evita execução dupla.
 * Etapas: scan 4H/1D → snapshot de mercado → sinais de padrão ao vivo → agentes do usuário → alertas → monitores →
 * ciclo de vida → retenção. Um `Deadline` compartilhado decide o que ainda cabe; etapa sem tempo fica para o próximo ciclo.
 */
async function handle(req: Request) {
  await connection();
  assertCronAuth(req);
  const res = await withCronLock("cycle", maxDuration, () => runCycle());
  return res ?? ok({ skipped: "running" });
}

async function runCycle() {
  const deadline = new Deadline(CYCLE_BUDGET_MS);
  const t0 = deadline.startedAt;
  const steps: Record<string, unknown> = {};
  const skipped: string[] = [];
  const step = async (name: string, minRemainingMs: number, fn: () => Promise<unknown>) => {
    if (deadline.expired(minRemainingMs)) {
      skipped.push(name);
      steps[name] = { ok: true, skipped: "sem tempo no ciclo", remainingMs: deadline.remaining() };
      return;
    }
    const s = Date.now();
    try {
      steps[name] = { ok: true, result: await fn(), ms: Date.now() - s };
    } catch (err) {
      steps[name] = { ok: false, error: (err as Error).message, ms: Date.now() - s };
      log.error(`etapa ${name} falhou`, { error: (err as Error).message });
    }
  };

  try {
    const scans: Awaited<ReturnType<typeof runScan>>[] = [];
    await step("scan", 0, async () => {
      const out: Record<string, unknown> = {};
      for (const tf of ["4h", "1d"] as const) {
        // o 4H com volume também grava a chave sem volume que a tabela do scanner lê (runScan)
        const r = await runScan({ timeframe: tf, includeVolume: tf === "4h", refresh: true });
        scans.push(r);
        out[tf] = { rows: r.rows.length, patterns: r.rows.reduce((s, x) => s + x.patterns.length, 0), volumeAlerts: r.volumeAlerts.length, sources: r.sources };
      }
      return out;
    });
    await step("market-snapshot", MIN_REMAINING_MS.snapshot, () => persistMarketSnapshot({ candlesPerAsset: 50, timeBudgetMs: deadline.budget(MIN_REMAINING_MS.snapshot, 25_000) }));
    // antes das etapas por usuário: depende só dos scans e alimenta /estatisticas
    await step("pattern-signals", MIN_REMAINING_MS.patternSignals, async () => {
      const { trackLiveSignals } = await import("@/services/pattern-stats-service");
      return trackLiveSignals(scans);
    });
    await step("user-agents", MIN_REMAINING_MS.agents, async () => {
      const res = await runAllActiveAgents({ shouldStop: () => deadline.expired(MIN_REMAINING_MS.alerts), concurrency: 4 });
      return { agents: res.length, signals: res.reduce((s, r) => s + r.signals.length, 0), alertsSent: res.reduce((s, r) => s + r.alertsSent, 0) };
    });
    await step("alerts", MIN_REMAINING_MS.alerts, () => evaluateAlerts({ shouldStop: () => deadline.expired(MIN_REMAINING_MS.lifecycle + 8_000), concurrency: 5 }));

    // Market Monitor: só com folga (o endpoint dedicado /api/cron/monitors cobre o restante)
    await step("monitors", MIN_REMAINING_MS.monitors, async () => {
      const { evaluateMonitors } = await import("@/services/monitor-service");
      return evaluateMonitors({ budgetMs: deadline.budget(MIN_REMAINING_MS.lifecycle + 8_000), concurrency: 4 });
    });

    await step("lifecycle", MIN_REMAINING_MS.lifecycle, async () => {
      const { runLifecycle } = await import("@/services/lifecycle-service");
      return runLifecycle();
    });

    await step("retention", MIN_REMAINING_MS.retention, async () => {
      const { runRetention } = await import("@/services/retention-service");
      return runRetention({ deadline, reserveMs: 3_000 });
    });

    log.info("ciclo via HTTP concluído", { ms: deadline.elapsed(), skipped });
    return ok({ ranAt: new Date(t0).toISOString(), durationMs: deadline.elapsed(), steps, skipped });
  } finally {
    // registrado mesmo se o ciclo lançar: o /status não fica com buraco sem aviso
    const failed = Object.entries(steps).filter(([, v]) => !(v as { ok: boolean }).ok).map(([k]) => k);
    const scanRan = "scan" in steps;
    // o ciclo só é considerado falho se o scan (etapa principal) falhar ou se 2+ etapas falharem
    await recordCronRun("cycle", t0, { ok: scanRan && !failed.includes("scan") && failed.length < 2, detail: { failed, skipped, durationMs: deadline.elapsed() } });
  }
}
export const GET = withApi(handle);
export const POST = withApi(handle);
