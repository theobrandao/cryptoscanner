import { randomUUID } from "node:crypto";
import { runAgent } from "@/agents/runtime";
import { scannerAgent, type ScannerOutput, type ScannerRow } from "@/agents/scanner-agent";
import { createDefaultTools } from "@/agents/tools";
import type { AgentRunResult } from "@/agents/types";
import { getPrisma } from "@/database/client";
import { ASSET_SYMBOLS } from "@/lib/assets";
import { getCache } from "@/lib/cache";
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

function cacheKey(o: ScanOptions): string {
  const syms = (o.symbols ?? [...ASSET_SYMBOLS]).slice().sort().join(",");
  return `scan:${o.timeframe}:${o.direction ?? "all"}:${o.minConfidence ?? 60}:${o.includeVolume ? "v" : "nv"}:${syms}`;
}

/**
 * Executa o scanner-agent com cache curto (o mesmo scan não é recalculado a cada usuário)
 * e persiste os padrões detectados quando há banco de dados.
 */
export async function runScan(options: ScanOptions): Promise<ScanResult> {
  const cache = getCache();
  const key = cacheKey(options);
  if (!options.refresh) {
    const hit = await cache.get<ScanResult>(key);
    if (hit) return { ...hit, cached: true };
  }
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
  const out: ScanResult = {
    ...result.output,
    runId,
    cached: false,
    agent: { status: result.status, durationMs: result.durationMs, error: result.error },
  };
  await cache.set(key, out, options.includeVolume ? TABLE_TTL_SECONDS : PATTERN_TTL_SECONDS);
  void persistPatterns(runId, out).catch((err) => log.warn("persistência do scan falhou", { error: (err as Error).message }));
  return out;
}

async function persistPatterns(runId: string, out: ScanResult): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  const rowsWithPatterns = out.rows.filter((r) => r.patterns.length > 0);
  if (rowsWithPatterns.length === 0) return;
  const assets = await prisma.asset.findMany({ where: { symbol: { in: rowsWithPatterns.map((r) => r.symbol) } }, select: { id: true, symbol: true } });
  const byS = new Map(assets.map((a) => [a.symbol, a.id]));
  const data = rowsWithPatterns.flatMap((r) =>
    r.patterns.flatMap((p) => {
      const assetId = byS.get(r.symbol);
      if (!assetId) return [];
      return [
        {
          runId,
          assetId,
          timeframe: out.timeframe,
          pattern: p.key,
          direction: p.direction,
          confidence: p.confidence,
          price: p.price,
          target: p.target,
          stop: p.stop,
          details: { summary: p.summary, points: p.points, levels: p.levels, source: r.source },
        },
      ];
    }),
  );
  if (data.length) await prisma.scannerResult.createMany({ data });
}

/** Linhas para a tabela em tempo real (colunas do scanner) — usa o scan completo com cache curto. */
export async function getScannerTable(timeframe: Timeframe, refresh = false): Promise<ScanResult> {
  return runScan({ timeframe, includeVolume: false, minConfidence: 60, refresh });
}

export type { ScannerRow };
