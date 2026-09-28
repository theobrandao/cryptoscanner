import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { evaluateAlerts } from "@/services/alert-service";
import { runScan } from "@/services/scanner-service";
import { runAllActiveAgents } from "@/services/user-agent-service";
import { persistMarketSnapshot } from "@/worker/persist";
import type { Timeframe } from "@/types/market";

const log = createLogger("scheduler");

/**
 * Ciclo periódico (padrão 5 min, como a verificação server-side citada pela referência):
 *  1. scan de padrões + volume em 4h e 1d (aquece o cache e persiste ScannerResult)
 *  2. snapshots de mercado, candles e indicadores no banco (quando há DATABASE_URL)
 *  3. agentes do usuário
 *  4. alertas do usuário
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    const seconds = getEnv().WORKER_CYCLE_SECONDS;
    log.info("scheduler iniciado", { cycleSeconds: seconds });
    void this.cycle();
    this.timer = setInterval(() => void this.cycle(), seconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async cycle() {
    if (this.running) {
      log.warn("ciclo anterior ainda em execução; pulando");
      return;
    }
    this.running = true;
    const t0 = Date.now();
    try {
      await this.step("scan", async () => {
        for (const tf of ["4h", "1d"] as Timeframe[]) {
          const r = await runScan({ timeframe: tf, includeVolume: tf === "4h", refresh: true });
          log.info("scan concluído", { tf, rows: r.rows.length, patterns: r.rows.reduce((s, x) => s + x.patterns.length, 0), volumeAlerts: r.volumeAlerts.length, sources: r.sources });
        }
      });
      await this.step("persist-market", async () => {
        const r = await persistMarketSnapshot({ candlesPerAsset: 50 });
        log.info("mercado persistido", { ...r });
      });
      await this.step("user-agents", async () => {
        const res = await runAllActiveAgents();
        log.info("agentes executados", { agents: res.length, signals: res.reduce((s, r) => s + r.signals.length, 0) });
      });
      await this.step("alerts", async () => {
        const res = await evaluateAlerts();
        log.info("alertas avaliados", res);
      });
    } finally {
      this.running = false;
      log.info("ciclo finalizado", { ms: Date.now() - t0 });
    }
  }

  private async step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      log.error(`etapa ${name} falhou`, { error: (err as Error).message });
    }
  }
}
