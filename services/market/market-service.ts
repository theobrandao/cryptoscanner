import type { AssetDefinition, Candle, CandleSeries, MarketSource, ProviderHealth, Ticker, Timeframe } from "@/types/market";
import { ASSETS, getAsset } from "@/lib/assets";
import { cached, getCache } from "@/lib/cache";
import { getMarketProviderOrder } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { TIMEFRAME_MS } from "@/lib/timeframes";
import { classifyStatus, DIVERGENCE_THRESHOLD_PCT, priceDivergencePct, validateCandles } from "@/lib/engines/quality";
import { binanceProvider } from "@/services/market/providers/binance";
import { cleanBubbles, getCoinMarkets, getGlobal, getMarketBubbles, type CoinMarket, type GlobalData, type MarketBubbleRaw } from "@/services/market/providers/coingecko";
import { getUsdBrlQuote, type FxQuote } from "@/services/market/providers/fx";
import { getCoinLoreMarkets, getPaprikaGlobal, getPaprikaMarkets } from "@/services/market/providers/market-data-fallback";
import { getKrakenSpotPrices, krakenProvider } from "@/services/market/providers/kraken";
import { ProviderError, type MarketProvider } from "@/services/market/providers/types";

const log = createLogger("market");

const PROVIDERS: Record<"binance" | "kraken", MarketProvider> = {
  binance: binanceProvider,
  kraken: krakenProvider,
};

/** Estado de indisponibilidade recente por provedor (evita bater em provedor bloqueado a cada chamada). */
const circuit = new Map<string, number>();
const CIRCUIT_MS = 120_000;

/** Permite injetar provedores em testes. */
let providerOverride: MarketProvider[] | null = null;
export function setProvidersForTests(providers: MarketProvider[] | null) {
  providerOverride = providers;
  circuit.clear();
}

/** Fonte primária configurada (primeira da ordem). */
function primarySource(): string {
  return providerOverride?.[0]?.name ?? getMarketProviderOrder()[0] ?? "binance";
}

function providers(): MarketProvider[] {
  if (providerOverride) return providerOverride;
  return getMarketProviderOrder().map((n) => PROVIDERS[n]);
}

// Chaves de cache
export const CACHE_KEYS = {
  candles: (symbol: string, tf: Timeframe) => `candles:${symbol}:${tf}`,
  tickers: "tickers:all",
  tickersLive: "tickers:live", // alimentado pelo worker via WebSocket
  providerHealth: "providers:health",
  brl: "fx:usdbrl",
  markets: "coingecko:markets",
  global: "coingecko:global",
  bubbles: "coingecko:bubbles",
} as const;

/** TTL de candles em função do timeframe (nunca menos de 20 s nem mais de 5 min). */
function candleTtlSeconds(tf: Timeframe): number {
  return Math.min(300, Math.max(20, Math.floor(TIMEFRAME_MS[tf] / 1000 / 12)));
}

function isOpen(name: string): boolean {
  const until = circuit.get(name);
  return until !== undefined && until > Date.now();
}

async function withFallback<T>(op: string, fn: (p: MarketProvider) => Promise<T>): Promise<{ value: T; source: MarketSource; errors: string[] }> {
  const errors: string[] = [];
  for (const p of providers()) {
    if (isOpen(p.name)) {
      errors.push(`${p.name}: circuito aberto`);
      continue;
    }
    try {
      const value = await fn(p);
      return { value, source: p.name, errors };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      // 451 (geo-bloqueio) ou rede: abre circuito por 2 min.
      if (err instanceof ProviderError && (err.status === 451 || err.status === undefined || err.status >= 500)) {
        circuit.set(p.name, Date.now() + CIRCUIT_MS);
      }
      log.warn(`${op} falhou em ${p.name}`, { error: msg });
    }
  }
  throw new Error(`Todos os provedores falharam para ${op}: ${errors.join(" | ")}`);
}

export interface CandlesOptions {
  limit?: number;
  /** força nova coleta ignorando o cache "fresco" */
  refresh?: boolean;
  /**
   * Inclui o candle em formação no fim de `candles`. Padrão false: sinais, indicadores e padrões usam
   * só candles fechados (sem repaint). Use true apenas para exibição (gráfico) ou volume do candle atual.
   */
  includeForming?: boolean;
}

export async function getCandles(symbol: string, timeframe: Timeframe, options: CandlesOptions = {}): Promise<CandleSeries> {
  const asset = getAsset(symbol);
  if (!asset) throw new Error(`Ativo desconhecido: ${symbol}`);
  const limit = options.limit ?? 300;
  const key = CACHE_KEYS.candles(asset.symbol, timeframe);
  if (options.refresh) await getCache().del(key);

  const res = await cached<{ candles: Candle[]; source: MarketSource; fetchedAt: number }>(
    key,
    candleTtlSeconds(timeframe),
    async () => {
      // Busca sempre uma janela ampla (600) e fatia por chamada, para que o cache sirva qualquer `limit` ≤ 600.
      const { value, source } = await withFallback(`candles ${asset.symbol} ${timeframe}`, (p) => p.getCandles(asset, timeframe, 600));
      if (!value.length) throw new Error("série vazia");
      return { candles: value, source, fetchedAt: Date.now() };
    },
    // janela de reserva proporcional ao timeframe: 3 períodos, entre 30 min e 3 dias (dado velho sai como DELAYED)
    { staleTtlSeconds: Math.min(3 * 86_400, Math.max(1800, Math.round((3 * TIMEFRAME_MS[timeframe]) / 1000))) },
  );

  const v = validateCandles(res.value.candles, timeframe);
  const base = options.includeForming ? v.candles : v.closed;
  const lastClosed = v.closed[v.closed.length - 1];
  const cls = classifyStatus({
    source: res.value.source,
    primarySource: primarySource(),
    fetchedAt: res.value.fetchedAt,
    stale: res.stale,
    timeframe,
    lastClosedOpenTime: lastClosed?.openTime ?? null,
    gaps: v.gaps,
    invalid: v.invalid,
  });
  return {
    symbol: asset.symbol,
    timeframe,
    candles: base.slice(-limit),
    forming: v.forming,
    source: res.value.source,
    fetchedAt: res.value.fetchedAt,
    stale: res.stale,
    quality: {
      status: cls.status,
      source: res.value.source,
      fetchedAt: res.value.fetchedAt,
      ageMs: Date.now() - res.value.fetchedAt,
      lastClosedOpenTime: lastClosed?.openTime ?? null,
      gaps: v.gaps,
      invalid: v.invalid,
      duplicates: v.duplicates,
      outliers: v.outliers,
      issues: [...v.issues, ...cls.issues],
    },
  };
}

export interface TickersResult {
  tickers: Ticker[];
  source: MarketSource;
  stale: boolean;
  fetchedAt: number;
}

/**
 * Tickers dos 30 ativos. Prioridade: snapshot ao vivo do worker (WebSocket) → REST com fallback → cache obsoleto.
 */
export async function getTickers(options: { refresh?: boolean } = {}): Promise<TickersResult> {
  const cache = getCache();
  if (!options.refresh) {
    const live = await cache.get<TickersResult>(CACHE_KEYS.tickersLive);
    if (live && Date.now() - live.fetchedAt < 15_000) return { ...live, stale: false };
  } else {
    await cache.del(CACHE_KEYS.tickers);
  }
  const res = await cached<TickersResult>(
    CACHE_KEYS.tickers,
    20,
    async () => {
      const { value, source } = await withFallback("tickers", (p) => p.getTickers(ASSETS));
      return { tickers: value, source, stale: false, fetchedAt: Date.now() };
    },
    { staleTtlSeconds: 6 * 3600 },
  );
  return { ...res.value, stale: res.stale };
}

export interface DivergenceRow {
  symbol: string;
  primary: number;
  reference: number;
  /** (referência − primária) / primária, em % (USDT na Binance × USD na Kraken: base difere ~0,0–0,2%) */
  pct: number;
  discrepancy: boolean;
}

export interface DivergenceReport {
  checkedAt: number;
  primarySource: MarketSource;
  referenceSource: "kraken";
  thresholdPct: number;
  rows: DivergenceRow[];
  discrepancies: number;
  maxAbsPct: number | null;
}

/**
 * Checagem cruzada de preço: ticker da fonte primária × último preço da Kraken (1 chamada).
 * Acima de DIVERGENCE_THRESHOLD_PCT o ativo é marcado como DATA DISCREPANCY. Cache de 60 s.
 */
export async function getPriceDivergence(): Promise<DivergenceReport> {
  const res = await cached<DivergenceReport>(
    "quality:divergence",
    60,
    async () => {
      const [primary, reference] = await Promise.all([getTickers(), getKrakenSpotPrices(ASSETS)]);
      const rows: DivergenceRow[] = [];
      for (const t of primary.tickers) {
        const ref = reference.get(t.symbol);
        const pct = ref != null ? priceDivergencePct(t.price, ref) : null;
        if (pct == null) continue;
        rows.push({ symbol: t.symbol, primary: t.price, reference: ref as number, pct, discrepancy: Math.abs(pct) > DIVERGENCE_THRESHOLD_PCT });
      }
      const discrepancies = rows.filter((r) => r.discrepancy);
      if (discrepancies.length) log.warn("DATA DISCREPANCY entre fontes", { symbols: discrepancies.map((r) => `${r.symbol} ${r.pct.toFixed(2)}%`) });
      return {
        checkedAt: Date.now(),
        primarySource: primary.source,
        referenceSource: "kraken",
        thresholdPct: DIVERGENCE_THRESHOLD_PCT,
        rows,
        discrepancies: discrepancies.length,
        maxAbsPct: rows.length ? Math.max(...rows.map((r) => Math.abs(r.pct))) : null,
      };
    },
    { staleTtlSeconds: 600 },
  );
  return res.value;
}

export async function getTicker(symbol: string): Promise<Ticker | undefined> {
  const { tickers } = await getTickers();
  return tickers.find((t) => t.symbol === symbol.toUpperCase());
}

/** USD→BRL (Binance USDT/BRL → CoinGecko → PTAX/BCB). Cache 5 min; reserva de 24 h marcada como stale. */
export async function getUsdBrl(): Promise<{ rate: number; stale: boolean; source: FxQuote["source"] | null; label: string | null; quotedAt: number | null }> {
  try {
    const res = await cached<FxQuote>(`${CACHE_KEYS.brl}:v2`, 300, getUsdBrlQuote, { staleTtlSeconds: 24 * 3600 });
    return { rate: res.value.rate, stale: res.stale, source: res.value.source, label: res.value.label, quotedAt: res.value.quotedAt };
  } catch (err) {
    log.warn("câmbio BRL indisponível", { error: (err as Error).message });
    return { rate: NaN, stale: true, source: null, label: null, quotedAt: null };
  }
}

export async function getMarketCaps(): Promise<{ markets: CoinMarket[]; stale: boolean } | null> {
  try {
    const res = await cached<CoinMarket[]>(CACHE_KEYS.markets, 120, () => getCoinMarkets(ASSETS), { staleTtlSeconds: 24 * 3600 });
    return { markets: res.value, stale: res.stale };
  } catch (err) {
    log.warn("coingecko markets indisponível", { error: (err as Error).message });
    return null;
  }
}

export async function getGlobalMarket(): Promise<{ data: GlobalData; stale: boolean } | null> {
  try {
    const res = await cached<GlobalData & { source?: string }>(
      CACHE_KEYS.global,
      300,
      async () => {
        try {
          return { ...(await getGlobal()), source: "coingecko" };
        } catch (err) {
          log.warn("coingecko global falhou; usando CoinPaprika", { error: (err as Error).message });
          return { ...(await getPaprikaGlobal()), source: "coinpaprika" };
        }
      },
      { staleTtlSeconds: 24 * 3600 },
    );
    return { data: res.value, stale: res.stale };
  } catch (err) {
    log.warn("coingecko global indisponível", { error: (err as Error).message });
    return null;
  }
}

export interface MarketBubble {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  marketCap: number;
  rank: number | null;
  volume24h: number;
  change: { "1h": number | null; "24h": number | null; "7d": number | null; "30d": number | null };
}

/** Top 100 por volume com variação 1h/24h/7d/30d (CoinGecko → CoinPaprika → CoinLore; cache 120 s; stale até 24 h). */
export async function getBubbles(limit = 100): Promise<{ bubbles: MarketBubble[]; stale: boolean; fetchedAt: number; source: string } | null> {
  try {
    // sempre busca/cacheia 100 e fatia por `limit` (uma única entrada de cache para todos os limites)
    const res = await cached<{ items: MarketBubbleRaw[]; at: number; source: string }>(
      CACHE_KEYS.bubbles,
      120,
      async () => {
        const errors: string[] = [];
        const sources: Array<[string, () => Promise<MarketBubbleRaw[]>]> = [
          ["coingecko", () => getMarketBubbles(100)],
          ["coinpaprika", async () => cleanBubbles(await getPaprikaMarkets(200), 100)],
          ["coinlore", async () => cleanBubbles(await getCoinLoreMarkets(200), 100)],
        ];
        for (const [source, load] of sources) {
          try {
            const items = await load();
            if (items.length >= 90) return { items, at: Date.now(), source };
            errors.push(`${source}: ${items.length} itens`);
          } catch (err) {
            errors.push(`${source}: ${(err as Error).message}`);
          }
        }
        throw new Error(errors.join(" · "));
      },
      { staleTtlSeconds: 24 * 3600 },
    );
    const bubbles = res.value.items.slice(0, limit).map<MarketBubble>((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      price: c.current_price,
      marketCap: c.market_cap,
      rank: c.market_cap_rank,
      volume24h: c.total_volume,
      change: {
        "1h": c.price_change_percentage_1h_in_currency ?? null,
        "24h": c.price_change_percentage_24h_in_currency ?? null,
        "7d": c.price_change_percentage_7d_in_currency ?? null,
        "30d": c.price_change_percentage_30d_in_currency ?? null,
      },
    }));
    return { bubbles, stale: res.stale, fetchedAt: res.value.at, source: res.value.source ?? "coingecko" };
  } catch (err) {
    log.warn("coingecko bubbles indisponível", { error: (err as Error).message });
    return null;
  }
}

/** Verifica os provedores (com cache de 60 s) para o indicador de status da interface. */
export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const res = await cached<ProviderHealth[]>(CACHE_KEYS.providerHealth, 60, async () => {
    const list = providers();
    return Promise.all(
      list.map(async (p): Promise<ProviderHealth> => {
        const t0 = Date.now();
        try {
          await p.ping();
          return { provider: p.name, ok: true, latencyMs: Date.now() - t0, checkedAt: Date.now() };
        } catch (err) {
          return { provider: p.name, ok: false, error: (err as Error).message, checkedAt: Date.now() };
        }
      }),
    );
  });
  return res.value;
}

export function listAssets(): readonly AssetDefinition[] {
  return ASSETS;
}
