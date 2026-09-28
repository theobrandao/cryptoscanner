/**
 * Worker: coletor de tickers (WebSocket/REST) + scheduler (scanner, persistência, agentes, alertas).
 * Executar com: npm run worker  (ou o serviço `worker` do docker-compose)
 * Carrega .env/.env.local do diretório do projeto.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { createLogger } = await import("@/lib/logger");
  const { getEnv } = await import("@/lib/env");
  const { TickerCollector } = await import("@/worker/collector");
  const { Scheduler } = await import("@/worker/scheduler");
  const log = createLogger("worker");
  const env = getEnv();
  log.info("iniciando worker", { providers: env.MARKET_PROVIDERS, db: Boolean(env.DATABASE_URL), redis: Boolean(env.REDIS_URL), cycle: env.WORKER_CYCLE_SECONDS });

  const collector = new TickerCollector();
  const scheduler = new Scheduler();
  collector.start();
  scheduler.start();

  const shutdown = (signal: string) => {
    log.info("encerrando", { signal });
    collector.stop();
    scheduler.stop();
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
