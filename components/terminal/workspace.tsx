"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronDown, Layers, RefreshCw, Sparkles, Star } from "lucide-react";
import { TerminalChart, DEFAULT_OVERLAYS, type ChartLabel, type ChartLine, type ChartSegmentLine, type ChartZone, type Legend, type Overlays } from "@/components/terminal/terminal-chart";
import { ConfluencePanel, DerivativesPanel, HistoricalPanel, LiquidityPanel, Panel, SetupPanel, StructurePanel, Unavailable } from "@/components/terminal/panels";
import { MarketOverviewPanel, RiskPanel, ScannerPanel, WatchlistPanel } from "@/components/terminal/bottom-panels";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTickers } from "@/hooks/use-tickers";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatNumber, formatPct, formatPrice, timeAgo } from "@/lib/format";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import { ApiClientError } from "@/lib/client-api";
import type { MarketContext } from "@/services/market-context-service";
import type { SetupRow } from "@/services/market-overview-service";
import type { Timeframe } from "@/types/market";

export const TERMINAL_TFS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));

const OVERLAY_LABEL: Record<keyof Overlays, string> = {
  ema: "EMA 9 / 21 / 50 / 200",
  bb: "Bollinger Bands (20, 2)",
  vwap: "VWAP (diária UTC)",
  volume: "Volume",
  rsi: "RSI 14",
  macd: "MACD 12 26 9",
  structure: "Market Structure (HH/HL/LH/LL, BOS, CHoCH)",
  liquidity: "Liquidity Zones",
  setup: "Setup: Entry Zone, Stop, Targets",
};

/* ------------------------------------------------------------------ Asset header */

function AssetHeader({ ctx, livePrice, liveChange }: { ctx: MarketContext; livePrice: number | null; liveChange: number | null }) {
  const a = ASSETS.find((x) => x.symbol === ctx.symbol);
  const t = ctx.ticker;
  const price = livePrice ?? t?.price ?? null;
  const change = liveChange ?? t?.changePct24h ?? null;
  const d = ctx.derivatives;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-warning/90 text-xl font-bold text-black">{a?.glyph}</span>
        <div>
          <h1 className="text-xl font-bold leading-tight tracking-tight">{ctx.symbol}/USDT</h1>
          <div className="text-[12px] text-muted-foreground">
            {ctx.name} · Binance · Spot{d ? " · Perp data: " + d.exchange.toUpperCase() : ""}
          </div>
        </div>
      </div>
      <div>
        <div className="tabular text-2xl font-bold leading-tight">{px(price)}</div>
        <div className={cn("tabular text-[13px]", (change ?? 0) >= 0 ? "text-success" : "text-danger")}>{change != null ? formatPct(change) : "—"}</div>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-[12px] sm:flex sm:flex-wrap">
        <Stat k="24h High" v={px(t?.high24h)} />
        <Stat k="24h Low" v={px(t?.low24h)} />
        <Stat k="24h Volume" v={t ? formatCompact(t.quoteVolume24h) : "—"} />
        <Stat k="Open Interest" v={d?.openInterestUsd != null ? formatCompact(d.openInterestUsd) : "n/d"} sub={d?.openInterestChange24hPct != null ? formatPct(d.openInterestChange24hPct, 1) : undefined} up={(d?.openInterestChange24hPct ?? 0) >= 0} />
        <Stat k="Funding Rate" v={d && Number.isFinite(d.fundingRate) ? `${(d.fundingRate * 100).toFixed(4)}%` : "n/d"} />
      </dl>
      <div className="ml-auto flex items-center gap-2">
        <span className="h-8 rounded-md border border-border px-3 text-[12px] leading-8" title="Fonte de preço e candles">
          ◆ Binance
        </span>
        <span className="h-8 rounded-md border border-border px-3 text-[12px] leading-8">USDT</span>
        <Link href={`/mentor?symbol=${ctx.symbol}&tf=${ctx.timeframe}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-gradient-to-r from-ai to-primary px-3 text-[12px] font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5" /> Ask AI Analyst
        </Link>
        <Link href="/carteira" className="grid h-8 w-8 place-items-center rounded-md border border-border text-warning" aria-label="Adicionar à watchlist">
          <Star className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, up }: { k: string; v: string; sub?: string; up?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] text-muted-foreground">{k}</dt>
      <dd className="tabular font-semibold">
        {v} {sub ? <span className={cn("text-[11px] font-normal", up ? "text-success" : "text-danger")}>{sub}</span> : null}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ chart layers from the context */

function layers(ctx: MarketContext, o: Overlays): { zones: ChartZone[]; labels: ChartLabel[]; lines: ChartLine[]; segments: ChartSegmentLine[] } {
  const zones: ChartZone[] = [];
  const labels: ChartLabel[] = [];
  const lines: ChartLine[] = [];
  const segments: ChartSegmentLine[] = [];
  const ext = ctx.structure.external;
  const first = ctx.candles[0]?.openTime ?? 0;
  const lastT = ctx.candles[ctx.candles.length - 1]?.openTime ?? 0;
  if (o.structure) {
    for (const s of ext.swings.slice(-14)) labels.push({ time: s.time, price: s.price, text: s.label ?? (s.kind === "high" ? "H" : "L"), position: s.kind === "high" ? "above" : "below", color: s.label === "HH" || s.label === "HL" ? "success" : s.label ? "danger" : "muted" });
    for (const e of ext.events.slice(-5)) {
      const sw = ext.swings.find((x) => x.index === e.swingIndex);
      segments.push({ from: { time: sw?.time ?? e.time, price: e.level }, to: { time: e.time, price: e.level }, color: e.direction === "bullish" ? "success" : "danger", label: e.type });
      labels.push({ time: e.time, price: e.level, text: e.type, position: e.direction === "bullish" ? "above" : "below", color: e.direction === "bullish" ? "success" : "danger" });
    }
  }
  if (o.liquidity) {
    const from = Math.max(first, lastT - 60 * (ctx.candles[1] ? ctx.candles[1].openTime - first : 0));
    const a = ctx.liquidity.above;
    const b = ctx.liquidity.below;
    if (a) zones.push({ top: a.high, bottom: a.low, from, label: `Liquidity Above · ${a.kind}`, color: "danger" });
    if (b) zones.push({ top: b.high, bottom: b.low, from, label: `Liquidity Below · ${b.kind}`, color: "info" });
    for (const sw of ctx.liquidity.recentSweeps.slice(0, 2)) labels.push({ time: sw.time, price: sw.price, text: "Liquidity Sweep", position: sw.direction === "bullish" ? "below" : "above", color: "info" });
  }
  if (o.setup && ctx.setup) {
    const st = ctx.setup;
    zones.push({ top: st.entryZone.high, bottom: st.entryZone.low, from: Math.max(first, lastT - 30 * (ctx.candles[1] ? ctx.candles[1].openTime - first : 0)), label: "Entry Zone", color: "success" });
    lines.push({ price: st.stop, label: "Stop", color: "danger", dashed: true });
    for (const t of st.targets) lines.push({ price: t.price, label: t.label, color: "success", dashed: true });
  }
  return { zones, labels, lines, segments };
}

/* ------------------------------------------------------------------ Chart card */

function ChartCard({ ctx, tf, onTf, overlays, setOverlays, onRefresh, refreshing }: { ctx: MarketContext; tf: Timeframe; onTf: (t: Timeframe) => void; overlays: Overlays; setOverlays: (o: Overlays) => void; onRefresh: () => void; refreshing: boolean }) {
  const [legend, setLegend] = React.useState<Legend | null>(null);
  const L = React.useMemo(() => layers(ctx, overlays), [ctx, overlays]);
  const tech = ctx.technicals;
  const q = ctx.quality;
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex flex-wrap gap-0.5" role="tablist" aria-label="Timeframe">
          {TERMINAL_TFS.map((t) => (
            <button key={t} role="tab" aria-selected={t === tf} onClick={() => onTf(t)} className={cn("h-7 rounded px-2.5 text-[12px] font-medium", t === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {TIMEFRAME_LABEL[t]}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <Layers className="h-3.5 w-3.5" /> Indicators & overlays <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {(Object.keys(OVERLAY_LABEL) as Array<keyof Overlays>).map((k) => (
              <DropdownMenuItem
                key={k}
                onSelect={(e) => {
                  e.preventDefault();
                  setOverlays({ ...overlays, [k]: !overlays[k] });
                }}
              >
                <span className={cn("grid h-4 w-4 place-items-center rounded border text-[10px]", overlays[k] ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{overlays[k] ? "✓" : ""}</span>
                {OVERLAY_LABEL[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Link href={`/carteira?tab=alerts&symbol=${ctx.symbol}`} className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <Bell className="h-3.5 w-3.5" /> Alert
        </Link>
        <button onClick={onRefresh} className="ml-auto inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Atualizar">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pt-2 text-[11.5px]">
        <span className="font-semibold">
          {ctx.pair} · {TIMEFRAME_LABEL[ctx.timeframe]} · Binance
        </span>
        {legend ? (
          <span className="tabular text-muted-foreground">
            O <span className="text-foreground">{px(legend.o)}</span> H <span className="text-foreground">{px(legend.h)}</span> L <span className="text-foreground">{px(legend.l)}</span> C{" "}
            <span className="text-foreground">{px(legend.c)}</span> <span className={legend.chg >= 0 ? "text-success" : "text-danger"}>{legend.chg >= 0 ? "+" : ""}{formatNumber(legend.chg, 2)}</span>
          </span>
        ) : null}
        {q ? (
          <span className={cn("rounded px-1.5 text-[10.5px] font-semibold", q.status === "LIVE" ? "bg-success/15 text-success" : q.status === "FALLBACK" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning")} title={q.issues.join(" · ") || `fonte ${q.source}`}>
            {q.status}
          </span>
        ) : null}
      </div>
      {overlays.ema ? (
        <div className="flex flex-wrap gap-x-3 px-3 text-[11px] tabular">
          <span style={{ color: "#a78bfa" }}>EMA 9 {px(tech.ema.e9)}</span>
          <span style={{ color: "#f59e0b" }}>EMA 21 {px(tech.ema.e21)}</span>
          <span style={{ color: "#fb7185" }}>EMA 50 {px(tech.ema.e50)}</span>
          <span className="text-foreground">EMA 200 {px(tech.ema.e200)}</span>
          {tech.vwap != null && overlays.vwap ? <span style={{ color: "#22d3ee" }}>VWAP {px(tech.vwap)}</span> : null}
        </div>
      ) : null}
      <div className="px-1 pb-1">
        <TerminalChart candles={ctx.candles} overlays={overlays} zones={L.zones} labels={L.labels} lines={L.lines} segments={L.segments} onLegend={setLegend} height={overlays.rsi || overlays.macd ? 720 : 560} />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">
        <span>Indicadores e estrutura calculados sobre candles fechados; o candle em formação só é exibido.</span>
        <span className="ml-auto">RSI {tech.rsi != null ? tech.rsi.toFixed(1) : "—"} · ATR {tech.atrPct != null ? `${tech.atrPct.toFixed(2)}%` : "—"} · Volatility {tech.volatility ?? "—"} · RVOL {tech.rvol != null ? `${tech.rvol.toFixed(2)}×` : "—"}</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Right column */

const RIGHT_TABS = ["Analysis", "Indicators", "Alerts"] as const;

function RightColumn({ ctx, overlays, setOverlays, onViewChart }: { ctx: MarketContext; overlays: Overlays; setOverlays: (o: Overlays) => void; onViewChart: () => void }) {
  const [tab, setTab] = React.useState<(typeof RIGHT_TABS)[number]>("Analysis");
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1" role="tablist">
        {RIGHT_TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)} className={cn("h-8 rounded-md text-[12.5px]", t === tab ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Analysis" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <StructurePanel ctx={ctx} />
          <LiquidityPanel ctx={ctx} onViewChart={onViewChart} />
          <ConfluencePanel ctx={ctx} className="sm:col-span-2" />
          <SetupPanel ctx={ctx} />
          <DerivativesPanel ctx={ctx} />
          <HistoricalPanel ctx={ctx} className="sm:col-span-2" />
        </div>
      ) : tab === "Indicators" ? (
        <Panel title="Indicators & overlays">
          <div className="flex flex-col gap-1">
            {(Object.keys(OVERLAY_LABEL) as Array<keyof Overlays>).map((k) => (
              <label key={k} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-[13px] hover:bg-muted">
                <input type="checkbox" checked={overlays[k]} onChange={() => setOverlays({ ...overlays, [k]: !overlays[k] })} />
                {OVERLAY_LABEL[k]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Fibonacci estrutural e volume profile entram no próximo pacote do Charts.</p>
        </Panel>
      ) : (
        <Panel title="Alerts">
          <p className="text-[12.5px] text-muted-foreground">
            Alertas de preço, indicador, padrão e volume para {ctx.symbol} ficam em Portfolio → Alertas; monitores de setup contínuos no Market Monitor.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href={`/carteira?tab=alerts&symbol=${ctx.symbol}`} className="flex h-9 flex-1 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground">
              Create alert
            </Link>
            <Link href="/sentinela" className="flex h-9 flex-1 items-center justify-center rounded-md border border-border text-[13px]">
              Market Monitor
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Access gate */

function AccessOrError({ error, symbol, tf }: { error: unknown; symbol: string; tf: Timeframe }) {
  const status = error instanceof ApiClientError ? error.status : 0;
  const next = encodeURIComponent(`/charts/${symbol}?tf=${tf}`);
  if (status === 401)
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-bold">Start your 7-day trial</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terminal completo por 7 dias: gráfico, estrutura, liquidez, Confluence Score, derivativos, histórico do setup e gestão de risco. Depois, PRO ou ELITE.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`/registro?next=${next}`} className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Criar conta
          </Link>
          <Link href={`/login?next=${next}`} className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm">
            Entrar
          </Link>
        </div>
      </div>
    );
  if (status === 402)
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-bold">Choose your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message} Sua conta, watchlists e configurações continuam salvas.</p>
        <Link href="/planos" className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Ver planos PRO e ELITE
        </Link>
      </div>
    );
  return <Unavailable>Não foi possível carregar {symbol}/USDT {TIMEFRAME_LABEL[tf]}. Nenhuma fonte de mercado respondeu; tente outro timeframe ou atualize.</Unavailable>;
}

/* ------------------------------------------------------------------ Workspace */

/**
 * Terminal do ativo. Contexto global = (símbolo da rota, timeframe da URL). Todos os painéis derivam de
 * UM request (/api/markets/{symbol}/context?tf=); trocar ativo ou timeframe troca a chave e nenhum painel
 * mostra dado de outro contexto (respostas antigas são descartadas pela chave do SWR).
 */
export function TerminalWorkspace({ symbol }: { symbol: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const tfRaw = params.get("tf") as Timeframe | null;
  const tf: Timeframe = tfRaw && TERMINAL_TFS.includes(tfRaw) ? tfRaw : "4h";
  const key = `/api/markets/${symbol}/context?tf=${tf}`;
  const { data: ctx, error, isValidating, mutate } = useSWR<MarketContext>(key, { refreshInterval: 60_000, keepPreviousData: false, revalidateOnFocus: false });
  const [overlays, setOverlays] = useLocalStorage<Overlays>("cs-overlays-v1", DEFAULT_OVERLAYS);
  const { bySymbol } = useTickers();
  const live = bySymbol.get(symbol);
  const { data: setups } = useSWR<{ rows: SetupRow[] }>(ctx ? `/api/markets/setups?tf=${tf}` : null, { revalidateOnFocus: false, refreshInterval: 120_000 });
  const trendBySymbol = React.useMemo(() => new Map((setups?.rows ?? []).map((r) => [r.symbol, r.trend])), [setups]);
  const setTf = (t: Timeframe) => router.replace(`/charts/${symbol}?tf=${t}`, { scroll: false });
  const chartRef = React.useRef<HTMLDivElement>(null);

  // o contexto exibido precisa bater com a URL atual (proteção extra contra corrida)
  const consistent = ctx && ctx.symbol === symbol && ctx.timeframe === tf ? ctx : null;

  return (
    <div className="flex flex-col gap-3 p-3">
      {error && !consistent ? <AccessOrError error={error} symbol={symbol} tf={tf} /> : null}
      {!consistent && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="skeleton h-[74px] rounded-lg" />
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(460px,36%)]">
            <div className="skeleton h-[640px] rounded-lg" />
            <div className="skeleton h-[640px] rounded-lg" />
          </div>
        </div>
      ) : null}
      {consistent ? (
        <>
          <AssetHeader ctx={consistent} livePrice={live?.price ?? null} liveChange={live?.changePct24h ?? null} />
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(460px,36%)]">
            <div ref={chartRef}>
              <ChartCard ctx={consistent} tf={tf} onTf={setTf} overlays={overlays} setOverlays={setOverlays} onRefresh={() => void mutate()} refreshing={isValidating} />
            </div>
            <RightColumn
              ctx={consistent}
              overlays={overlays}
              setOverlays={setOverlays}
              onViewChart={() => {
                setOverlays({ ...overlays, liquidity: true });
                chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2 min-[1700px]:grid-cols-4">
            <WatchlistPanel selected={symbol} tf={tf} trendBySymbol={trendBySymbol} />
            <MarketOverviewPanel />
            <ScannerPanel tf={tf} selected={symbol} />
            <RiskPanel key={`${symbol}-${tf}`} ctx={consistent} />
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            Contexto gerado {timeAgo(consistent.generatedAt)} · atualiza a cada 60 s · OBSERVED: preço, candles, volume, OI, funding · DERIVED: estrutura, liquidez, indicadores, setup, Confluence Score · histórico: backtest do setup.
          </p>
        </>
      ) : null}
    </div>
  );
}
