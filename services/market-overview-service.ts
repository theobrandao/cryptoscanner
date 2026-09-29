import { cached } from "@/lib/cache";
import { ASSETS } from "@/lib/assets";
import { getBubbles, getGlobalMarket, getTickers } from "@/services/market/market-service";
import { getFearGreed } from "@/services/sentiment/fear-greed";
import { getMarketContext } from "@/services/market-context-service";
import { createLimiter } from "@/services/market/providers/types";
import type { Timeframe } from "@/types/market";

export interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct24h: number | null;
  volume24h: number;
  marketCap: number;
}

export interface MarketOverview {
  generatedAt: number;
  global: { totalMarketCapUsd: number; marketCapChange24hPct: number; totalVolumeUsd: number; btcDominance: number; ethDominance: number; source: string; timestamp: number; stale: boolean } | null;
  fearGreed: { value: number; classification: string; source: string; timestamp: number; stale: boolean } | null;
  topGainers: MoverRow[];
  topLosers: MoverRow[];
  volumeLeaders: MoverRow[];
  moversSource: { source: string; timestamp: number; stale: boolean } | null;
}

/** Visão geral: CoinGecko (capitalização, dominância, top 100) e alternative.me (Medo & Ganância). Cada bloco pode vir null. */
export async function getMarketOverview(): Promise<MarketOverview> {
  const [g, f, b] = await Promise.all([getGlobalMarket().catch(() => null), getFearGreed().catch(() => null), getBubbles(100).catch(() => null)]);
  const rows: MoverRow[] = (b?.bubbles ?? []).map((x) => ({ symbol: x.symbol.toUpperCase(), name: x.name, price: x.price, changePct24h: x.change["24h"], volume24h: x.volume24h, marketCap: x.marketCap }));
  const withChange = rows.filter((r) => r.changePct24h != null);
  return {
    generatedAt: Date.now(),
    global: g
      ? {
          totalMarketCapUsd: g.data.total_market_cap.usd ?? NaN,
          marketCapChange24hPct: g.data.market_cap_change_percentage_24h_usd,
          totalVolumeUsd: g.data.total_volume.usd ?? NaN,
          btcDominance: g.data.market_cap_percentage.btc ?? NaN,
          ethDominance: g.data.market_cap_percentage.eth ?? NaN,
          source: "CoinGecko /global",
          timestamp: g.data.updated_at * 1000,
          stale: g.stale,
        }
      : null,
    fearGreed: f ? { value: f.data.value, classification: f.data.classification, source: f.data.source, timestamp: f.data.timestamp, stale: f.stale } : null,
    topGainers: [...withChange].sort((a, b2) => (b2.changePct24h ?? 0) - (a.changePct24h ?? 0)).slice(0, 8),
    topLosers: [...withChange].sort((a, b2) => (a.changePct24h ?? 0) - (b2.changePct24h ?? 0)).slice(0, 8),
    volumeLeaders: [...rows].sort((a, b2) => b2.volume24h - a.volume24h).slice(0, 8),
    moversSource: b ? { source: "CoinGecko /coins/markets (top 100 por volume)", timestamp: b.fetchedAt, stale: b.stale } : null,
  };
}

export interface SetupRow {
  symbol: string;
  name: string;
  price: number | null;
  changePct24h: number | null;
  quoteVolume24h: number | null;
  trend: string;
  direction: string;
  state: string | null;
  verdict: string;
  label: string;
  score: number;
  rr: number | null;
}

/** Ranking de setups do universo (confluência do contexto completo). Cache 120 s; aquecido pelo ciclo. */
export async function getSetupRanking(tf: Timeframe): Promise<{ timeframe: Timeframe; generatedAt: number; rows: SetupRow[]; errors: string[] }> {
  const res = await cached(`setups:v1:${tf}`, 120, async () => {
    const limiter = createLimiter(4, 0);
    const errors: string[] = [];
    const rows: SetupRow[] = [];
    await Promise.all(
      ASSETS.map((a) =>
        limiter(async () => {
          try {
            const c = await getMarketContext(a.symbol, tf);
            rows.push({
              symbol: a.symbol,
              name: a.name,
              price: c.ticker?.price ?? null,
              changePct24h: c.ticker?.changePct24h ?? null,
              quoteVolume24h: c.ticker?.quoteVolume24h ?? null,
              trend: c.structure.trend,
              direction: c.confluence.direction,
              state: c.setup?.state ?? null,
              verdict: c.confluence.verdict,
              label: c.confluence.label,
              score: c.confluence.score,
              rr: c.setup?.rr ?? null,
            });
          } catch (err) {
            errors.push(`${a.symbol}: ${(err as Error).message}`);
          }
        }),
      ),
    );
    rows.sort((x, y) => y.score - x.score);
    return { timeframe: tf, generatedAt: Date.now(), rows, errors };
  });
  return res.value;
}

/** Watchlist: tickers observados; tendência vem do ranking quando já calculado (sem cálculo extra). */
export async function getWatchlistRows(symbols: readonly string[]) {
  const t = await getTickers();
  const by = new Map(t.tickers.map((x) => [x.symbol, x]));
  return {
    source: t.source,
    stale: t.stale,
    fetchedAt: t.fetchedAt,
    rows: symbols.map((s) => {
      const k = by.get(s);
      return { symbol: s, price: k?.price ?? null, changePct24h: k?.changePct24h ?? null, quoteVolume24h: k?.quoteVolume24h ?? null };
    }),
  };
}
