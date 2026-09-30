import { randomUUID } from "node:crypto";
import { runAgent } from "@/agents/runtime";
import { scannerAgent, type ScannerOutput, type ScannerRow } from "@/agents/scanner-agent";
import { createDefaultTools } from "@/agents/tools";
import type { AgentRunResult } from "@/agents/types";
import { ASSET_SYMBOLS } from "@/lib/assets";
import { cached, primeCached } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import type { Timeframe } from "@/types/market";

const log = createLogger("scanner-service");

export interface ScanOptions {
  timeframe: Timeframe;
  symbols?: string[];
  direction?: "all" | "bullish" | "bearish";
  minConfidence?: number;
  includeVolume?: boolean;
  /** ignora cache e força novo scan */
  refresh?: boolean;
}

export interface ScanResult extends ScannerOutput {
  runId: string;
  cached: boolean;
  agent: Pick<AgentRunResult<unknown>, "status" | "durationMs" | "error">;
}

const TABLE_TTL_SECONDS = 30;
const PATTERN_TTL_SECONDS = 60;
/** Janela em que o scan vencido é servido na hora enquanto é refeito em segundo plano: cobre o intervalo de 5 min do cron. */
const SCAN_SWR_SECONDS = 6 * 60;
const SCAN_STALE_TTL_SECONDS = 3600;

function cacheKey(o: ScanOptions): string {
  const syms = (o.symbols ?? [...ASSET_SYMBOLS]).slice().sort().join(",");
  return `scan:${o.timeframe}:${o.direction ?? "all"}:${o.minConfidence ?? 60}:${o.includeVolume ? "v" : "nv"}:${syms}`;
}

type StoredScan = Omit<ScanResult, "cached">;

/**
 * Executa o scanner-agent com cache curto (o mesmo scan não é recalculado a cada usuário): single-flight, trava
 * distribuída e valor recém-vencido servido enquanto o próximo é calculado. As linhas não dependem de `includeVolume`,
 * então um scan com volume também aquece a chave sem volume (a que a tabela lê) — é o que o cron faz a cada 5 min.
 */
export async function runScan(options: ScanOptions): Promise<ScanResult> {
  const key = cacheKey(options);
  const ttl = options.includeVolume ? TABLE_TTL_SECONDS : PATTERN_TTL_SECONDS;
  const res = await cached<StoredScan>(key, ttl, () => computeScan(options), { force: options.refresh, lock: true, swrSeconds: SCAN_SWR_SECONDS, staleTtlSeconds: SCAN_STALE_TTL_SECONDS });
  if (options.includeVolume && !res.fromCache) {
    await primeCached(cacheKey({ ...options, includeVolume: false }), { ...res.value, volumeAlerts: [] }, PATTERN_TTL_SECONDS, { staleTtlSeconds: SCAN_STALE_TTL_SECONDS }).catch((err) => log.warn("aquecimento da tabela falhou", { error: (err as Error).message }));
  }
  return { ...res.value, cached: res.fromCache };
}

async function computeScan(options: ScanOptions): Promise<StoredScan> {
  const runId = randomUUID();
  const result = await runAgent(
    scannerAgent,
    {
      symbols: options.symbols ?? [...ASSET_SYMBOLS],
      timeframe: options.timeframe,
      includePatterns: true,
      minPatternConfidence: options.minConfidence ?? 60,
      patternDirection: options.direction ?? "all",
      includeVolume: options.includeVolume ?? false,
    },
    { tools: createDefaultTools(), executionId: runId },
  );
  if (!result.output) {
    throw new Error(result.error ?? "scanner falhou");
  }
  // ScannerResult deixou de ser gravado (nada o lia); padrões ao vivo ficam em PatternSignal (trackLiveSignals)
  return { ...result.output, runId, agent: { status: result.status, durationMs: result.durationMs, error: result.error } };
}

/** Linhas para a tabela em tempo real (colunas do scanner) — usa o scan completo com cache curto. */
export async function getScannerTable(timeframe: Timeframe, refresh = false): Promise<ScanResult> {
  return runScan({ timeframe, includeVolume: false, minConfidence: 60, refresh });
}

export type { ScannerRow };
