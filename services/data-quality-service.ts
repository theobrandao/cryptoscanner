import { ASSETS } from "@/lib/assets";
import type { DataQuality, DataStatus } from "@/lib/engines/quality";
import { getCandles, getPriceDivergence, type DivergenceReport } from "@/services/market/market-service";
import { createLimiter } from "@/services/market/providers/types";
import type { Timeframe } from "@/types/market";

export interface AssetQuality {
  symbol: string;
  quality: DataQuality | null;
  error?: string;
  divergencePct: number | null;
}

export interface QualityReport {
  timeframe: Timeframe;
  checkedAt: number;
  counts: Record<DataStatus, number>;
  assets: AssetQuality[];
  divergence: DivergenceReport | null;
}

/** Qualidade por ativo (série do timeframe) + checagem cruzada de preço entre fontes. */
export async function getQualityReport(timeframe: Timeframe): Promise<QualityReport> {
  const limiter = createLimiter(6, 0);
  const divergence = await getPriceDivergence().catch(() => null);
  const div = new Map((divergence?.rows ?? []).map((r) => [r.symbol, r]));
  const assets = await Promise.all(
    ASSETS.map((a) =>
      limiter(async (): Promise<AssetQuality> => {
        const d = div.get(a.symbol);
        try {
          const s = await getCandles(a.symbol, timeframe, { limit: 300 });
          const q = s.quality ?? null;
          // divergência acima do limite rebaixa LIVE/FALLBACK para DEGRADED
          if (q && d?.discrepancy && (q.status === "LIVE" || q.status === "FALLBACK")) {
            q.status = "DEGRADED";
            q.issues = [...q.issues, `DATA DISCREPANCY: ${d.pct.toFixed(2)}% vs Kraken`];
          }
          return { symbol: a.symbol, quality: q, divergencePct: d?.pct ?? null };
        } catch {
          return { symbol: a.symbol, quality: null, error: "Nenhuma fonte respondeu e não há cache para este ativo.", divergencePct: d?.pct ?? null };
        }
      }),
    ),
  );
  const counts: Record<DataStatus, number> = { LIVE: 0, DELAYED: 0, DEGRADED: 0, OFFLINE: 0, FALLBACK: 0 };
  for (const a of assets) counts[a.quality?.status ?? "OFFLINE"]++;
  return { timeframe, checkedAt: Date.now(), counts, assets, divergence };
}
