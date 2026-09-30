"use client";

import * as React from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/entitlements";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronDown, Layers, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, RefreshCw, Star, Check } from "lucide-react";
import { TerminalChart, lowerPanes, withOverlayDefaults, type ChartLabel, type ChartLine, type ChartSegmentLine, type ChartZone, type Legend, type Overlays } from "@/components/terminal/terminal-chart";
import { ConfluencePanel, countdown, DerivativesPanel, HistoricalPanel, LiquidityPanel, Panel, REGIME_TONE, SetupPanel, StructurePanel, Unavailable } from "@/components/terminal/panels";
import { MarketOverviewPanel, RiskPanel, ScannerPanel, WatchlistPanel } from "@/components/terminal/bottom-panels";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/providers/toast-provider";
import { useTickers } from "@/hooks/use-tickers";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSession } from "@/hooks/use-session";
import { DEFAULT_SELECTION, selectionFromParams, selectionKey, setActiveSelection, SELECTION_TFS, useActiveSelection, type MarketSelection } from "@/hooks/use-market-selection";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatDateTime, formatNumber, formatPct, formatPrice, timeAgo } from "@/lib/format";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { INSTRUMENT_LABEL, INSTRUMENTS, VENUE_LABEL, VENUES } from "@/lib/venues";
import { cn } from "@/lib/utils";
import { apiFetch, ApiClientError, postJson } from "@/lib/client-api";
import type { MarketContext } from "@/services/market-context-service";
import type { SetupRow } from "@/services/market-overview-service";
import type { Timeframe } from "@/types/market";
import { OnboardingCard } from "@/components/terminal/onboarding-card";
import { trackClient } from "@/lib/analytics-client";
import { DATA_STATUS_PT, poolShort, pt, REGIME_PT, VOLATILITY_PT } from "@/lib/display-labels";

export const TERMINAL_TFS: Timeframe[] = SELECTION_TFS;
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));

const OVERLAY_LABEL: Record<keyof Overlays, string> = {
  ema: "EMA 9 / 21 / 50 / 100 / 200",
  bb: "Bandas de Bollinger (20, 2)",
  vwap: "VWAP (diária UTC)",
  volume: "Volume",
  rsi: "RSI 14",
  macd: "MACD 12 26 9",
  atr: "ATR 14",
  structure: "Estrutura de mercado (HH/HL/LH/LL, BOS, CHoCH)",
  liquidity: "Liquidez (EQH/EQL, PDH/PDL, varreduras)",
  levels: "Suporte / resistência",
  setup: "Setup: zona de entrada, stop, alvos, gatilho",
};

const STATUS_CHIP: Record<string, string> = {
  LIVE: "bg-success/15 text-success",
  FALLBACK: "bg-info/15 text-info",
  DEGRADED: "bg-warning/15 text-warning",
  DELAYED: "bg-warning/15 text-warning",
  OFFLINE: "bg-danger/15 text-danger",
};

/* ------------------------------------------------------------------ Segmented control */

function Segmented<T extends string>({ items, value, onChange, label, render }: { items: readonly T[]; value: T; onChange: (v: T) => void; label: string; render: (v: T) => string }) {
  return (
    <div className="flex rounded-md border border-border p-0.5 text-[12px]" role="radiogroup" aria-label={label}>
      {items.map((i) => (
        <button key={i} role="radio" aria-checked={i === value} onClick={() => onChange(i)} className={cn("h-7 rounded px-2.5", i === value ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {render(i)}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Asset header */

function AssetHeader({ ctx, sel, onChange, live }: { ctx: MarketContext; sel: MarketSelection; onChange: (p: Partial<MarketSelection>) => void; live: { price: number; changePct24h: number } | null }) {
  const a = ASSETS.find((x) => x.symbol === ctx.symbol);
  const t = ctx.ticker;
  const price = live?.price ?? t?.price ?? null;
  const change = live?.changePct24h ?? t?.changePct24h ?? null;
  const d = ctx.derivatives;
  const perp = ctx.instrument === "perp";
  const q = ctx.quality;
  const fallback = ctx.dataVenue !== ctx.exchange;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const { user } = useSession();
  const { toast } = useToast();
  const monitor = async () => {
    try {
      await postJson("/api/monitors", { symbol: ctx.symbol, timeframe: ctx.timeframe, exchange: ctx.exchange, instrument: ctx.instrument, kind: "SETUP" });
      toast({ title: `Monitor criado: ${ctx.symbol} ${ctx.timeframe.toUpperCase()}`, description: "Aviso quando o setup mudar para READY, TRIGGERED, INVALIDATED ou TARGET HIT.", variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível criar o monitor", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    }
  };
  const addToWatchlist = async () => {
    try {
      await postJson("/api/watchlist", { symbol: ctx.symbol });
      toast({ title: `${ctx.symbol} adicionado à watchlist`, variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível adicionar", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    }
  };
  const provenance = `Fonte: ${t?.stamp.source ?? "—"} · candles ${VENUE_LABEL[ctx.dataVenue]} ${INSTRUMENT_LABEL[ctx.instrument]} · atualizado ${t ? formatDateTime(t.stamp.timestamp ?? ctx.generatedAt) : "—"}`;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-lg font-bold">{a?.glyph}</span>
          <div>
            <h1 className="text-xl font-bold leading-tight tracking-tight">{ctx.symbol}/USDT</h1>
            <div className="text-[12px] text-muted-foreground">
              {ctx.name} · {VENUE_LABEL[ctx.exchange]} · {INSTRUMENT_LABEL[ctx.instrument]}
            </div>
          </div>
        </div>
        <div title={provenance}>
          <div className="tabular text-2xl font-bold leading-tight">{px(price)}</div>
          <div className={cn("tabular text-[13px]", (change ?? 0) >= 0 ? "text-success" : "text-danger")}>{change != null ? formatPct(change) : "—"} 24h</div>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-[12px] sm:flex sm:flex-wrap">
          <Stat k="Máxima 24h" v={px(t?.high24h)} />
          <Stat k="Mínima 24h" v={px(t?.low24h)} />
          <Stat k="Volume 24h" v={t ? formatCompact(t.quoteVolume24h) : "—"} />
          {perp ? (
            <>
              <Stat k="Open Interest" v={d?.openInterestUsd != null ? formatCompact(d.openInterestUsd) : "n/d"} sub={d?.openInterestChange24hPct != null ? formatPct(d.openInterestChange24hPct, 1) : undefined} up={(d?.openInterestChange24hPct ?? 0) >= 0} />
              <Stat k="Funding" v={d && Number.isFinite(d.fundingRate) ? `${(d.fundingRate * 100).toFixed(4)}%` : "n/d"} />
              <Stat k="Próximo funding" v={d && Number.isFinite(d.nextFundingTime) && d.nextFundingTime > 0 ? countdown(d.nextFundingTime, now) : "n/d"} />
            </>
          ) : null}
        </dl>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn("rounded px-2 py-1 text-[11px] font-semibold", REGIME_TONE[ctx.regime.regime] === "up" ? "bg-success/15 text-success" : REGIME_TONE[ctx.regime.regime] === "down" ? "bg-danger/15 text-danger" : REGIME_TONE[ctx.regime.regime] === "warn" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")} title={`Regime de mercado: ${ctx.regime.reasons.join(" · ")}`}>
            {pt(REGIME_PT, ctx.regime.regime)}
          </span>
          {q ? (
            <span className={cn("rounded px-2 py-1 text-[11px] font-semibold", STATUS_CHIP[q.status] ?? "bg-muted")} title={`${provenance}${q.issues.length ? ` · ${q.issues.join(" · ")}` : ""}`}>
              {pt(DATA_STATUS_PT, q.status)}
              {fallback ? ` · ${VENUE_LABEL[ctx.dataVenue]}` : ""}
            </span>
          ) : null}
          {user ? (
            <button onClick={() => void monitor()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground" title="Monitorar este setup no servidor">
              <Bell className="h-3.5 w-3.5" /> Monitorar
            </button>
          ) : null}
          {user ? (
            <button onClick={() => void addToWatchlist()} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-warning" aria-label="Adicionar aos favoritos" title="Adicionar aos favoritos">
              <Star className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented items={VENUES} value={sel.exchange} onChange={(exchange) => onChange({ exchange })} label="Exchange" render={(v) => VENUE_LABEL[v]} />
        <Segmented items={INSTRUMENTS} value={sel.instrument} onChange={(instrument) => onChange({ instrument })} label="Instrumento" render={(v) => INSTRUMENT_LABEL[v]} />
        {fallback ? <span className="text-[11px] text-info">{VENUE_LABEL[ctx.exchange]} indisponível agora: dados de {VENUE_LABEL[ctx.dataVenue]} (fonte alternativa).</span> : null}
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
  const span = ctx.candles[1] ? ctx.candles[1].openTime - first : 0;
  if (o.structure) {
    for (const s of ext.swings.slice(-14)) labels.push({ time: s.time, price: s.price, text: s.label ?? (s.kind === "high" ? "H" : "L"), position: s.kind === "high" ? "above" : "below", color: s.label === "HH" || s.label === "HL" ? "success" : s.label ? "danger" : "muted" });
    for (const e of ext.events.slice(-5)) {
      const sw = ext.swings.find((x) => x.index === e.swingIndex);
      segments.push({ from: { time: sw?.time ?? e.time, price: e.level }, to: { time: e.time, price: e.level }, color: e.direction === "bullish" ? "success" : "danger", label: e.type });
      labels.push({ time: e.time, price: e.level, text: e.type, position: e.direction === "bullish" ? "above" : "below", color: e.direction === "bullish" ? "success" : "danger" });
    }
  }
  if (o.liquidity) {
    const from = Math.max(first, lastT - 60 * span);
    const a = ctx.liquidity.above;
    const b = ctx.liquidity.below;
    if (a) zones.push({ top: a.high, bottom: a.low, from, label: `Liq ↑ ${poolShort(a.kind)}`, color: "warning" });
    if (b) zones.push({ top: b.high, bottom: b.low, from, label: `Liq ↓ ${poolShort(b.kind)}`, color: "warning" });
    for (const sw of ctx.liquidity.recentSweeps.slice(0, 2)) labels.push({ time: sw.time, price: sw.price, text: "Varredura", position: sw.direction === "bullish" ? "below" : "above", color: "info" });
  }
  if (o.levels) {
    const from = Math.max(first, lastT - 80 * span);
    const r = ctx.levels.nearestResistance;
    const s = ctx.levels.nearestSupport;
    if (r) zones.push({ top: r.high, bottom: r.low, from, label: `R ${r.touches}×`, color: "danger" });
    if (s) zones.push({ top: s.high, bottom: s.low, from, label: `S ${s.touches}×`, color: "success" });
  }
  if (o.setup && ctx.setup) {
    const st = ctx.setup;
    zones.push({ top: st.entryZone.high, bottom: st.entryZone.low, from: Math.max(first, lastT - 30 * span), label: "Zona de entrada", color: "info" });
    lines.push({ price: st.stop, label: "Stop", color: "danger", dashed: true });
    for (const t of st.targets) lines.push({ price: t.price, label: `${t.label} ${t.r.toFixed(1)}R`, color: "success", dashed: true });
    if (st.triggerLevel) lines.push({ price: st.triggerLevel.price, label: "Gatilho", color: "info", dashed: false });
  }
  return { zones, labels, lines, segments };
}

/* ------------------------------------------------------------------ Chart card */

function ChartCard({
  ctx,
  tf,
  onTf,
  overlays,
  setOverlays,
  onRefresh,
  refreshing,
  focus,
  onFocus,
  analysisOpen,
  onToggleAnalysis,
}: {
  ctx: MarketContext;
  tf: Timeframe;
  onTf: (t: Timeframe) => void;
  overlays: Overlays;
  setOverlays: (o: Overlays) => void;
  onRefresh: () => void;
  refreshing: boolean;
  focus: boolean;
  onFocus: () => void;
  analysisOpen: boolean;
  onToggleAnalysis: () => void;
}) {
  const [legend, setLegend] = React.useState<Legend | null>(null);
  const L = React.useMemo(() => layers(ctx, overlays), [ctx, overlays]);
  const tech = ctx.technicals;
  const ref = React.useRef<HTMLElement>(null);
  const [fs, setFs] = React.useState(false);
  React.useEffect(() => {
    const on = () => setFs(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  };
  const base = focus || fs ? 640 : 520;
  const height = base + lowerPanes(overlays) * 90;
  return (
    <section ref={ref} className={cn("min-w-0 rounded-lg border border-border bg-card", fs && "overflow-auto")}>
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
              <Layers className="h-3.5 w-3.5" /> Indicadores <ChevronDown className="h-3 w-3" />
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
                <span className={cn("grid h-4 w-4 place-items-center rounded border text-[10px]", overlays[k] ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{overlays[k] ? <Check className="h-3 w-3" aria-hidden /> : null}</span>
                {OVERLAY_LABEL[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Link href={`/carteira?tab=alerts&symbol=${ctx.symbol}`} className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <Bell className="h-3.5 w-3.5" /> Alerta
        </Link>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={onFocus} className={cn("hidden h-7 items-center gap-1 rounded px-2 text-[12px] hover:bg-muted xl:inline-flex", focus ? "text-foreground" : "text-muted-foreground")} aria-pressed={focus} title="Foco no gráfico">
            Foco
          </button>
          <button onClick={onToggleAnalysis} className="hidden h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground xl:grid" aria-label={analysisOpen ? "Recolher análise" : "Expandir análise"} title={analysisOpen ? "Recolher análise" : "Expandir análise"}>
            {analysisOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </button>
          <button onClick={toggleFs} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={fs ? "Sair da tela cheia" : "Tela cheia"} title="Tela cheia">
            {fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onRefresh} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Atualizar">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pt-2 text-[11.5px]">
        <span className="font-semibold">
          {ctx.pair} · {TIMEFRAME_LABEL[ctx.timeframe]} · {VENUE_LABEL[ctx.dataVenue]} {INSTRUMENT_LABEL[ctx.instrument]}
        </span>
        {legend ? (
          <span className="tabular text-muted-foreground">
            A <span className="text-foreground">{px(legend.o)}</span> Máx <span className="text-foreground">{px(legend.h)}</span> Mín <span className="text-foreground">{px(legend.l)}</span> F{" "}
            <span className="text-foreground">{px(legend.c)}</span> <span className={legend.chg >= 0 ? "text-success" : "text-danger"}>{legend.chg >= 0 ? "+" : ""}{formatNumber(legend.chg, 2)}</span>
          </span>
        ) : null}
      </div>
      {overlays.ema ? (
        <div className="flex flex-wrap gap-x-3 px-3 text-[11px] tabular">
          <span style={{ color: "#a78bfa" }}>EMA 9 {px(tech.ema.e9)}</span>
          <span style={{ color: "#f59e0b" }}>EMA 21 {px(tech.ema.e21)}</span>
          <span style={{ color: "#fb7185" }}>EMA 50 {px(tech.ema.e50)}</span>
          <span style={{ color: "#38bdf8" }}>EMA 100 {px(tech.ema.e100)}</span>
          <span className="text-foreground">EMA 200 {px(tech.ema.e200)}</span>
          {tech.vwap != null && overlays.vwap ? <span style={{ color: "#22d3ee" }}>VWAP {px(tech.vwap)}</span> : null}
        </div>
      ) : null}
      <div className="px-1 pb-1">
        <TerminalChart candles={ctx.candles} overlays={overlays} zones={L.zones} labels={L.labels} lines={L.lines} segments={L.segments} onLegend={setLegend} height={height} />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">
        <span>Indicadores e estrutura sobre candles fechados; o candle em formação só é exibido.</span>
        <span className="ml-auto">RSI {tech.rsi != null ? tech.rsi.toFixed(1) : "—"} · ATR {tech.atrPct != null ? `${tech.atrPct.toFixed(2)}%` : "—"} · Volatilidade {pt(VOLATILITY_PT, tech.volatility)} · RVOL {tech.rvol != null ? `${tech.rvol.toFixed(2)}×` : "—"}</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Right column */

const RIGHT_TABS = ["Analysis", "Indicators", "Alerts"] as const;
const RIGHT_LABEL: Record<(typeof RIGHT_TABS)[number], string> = { Analysis: "Análise", Indicators: "Indicadores", Alerts: "Alertas" };

function RightColumn({ ctx, overlays, setOverlays, onViewChart, onSwitchPerp }: { ctx: MarketContext; overlays: Overlays; setOverlays: (o: Overlays) => void; onViewChart: () => void; onSwitchPerp: () => void }) {
  const [tab, setTab] = React.useState<(typeof RIGHT_TABS)[number]>("Analysis");
  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1" role="tablist">
        {RIGHT_TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)} className={cn("h-8 rounded-md text-[12.5px]", t === tab ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {RIGHT_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "Analysis" ? (
        <div className="grid gap-3 @min-[560px]:grid-cols-2" data-note="2 colunas só com largura de coluna suficiente (container query)">
          <StructurePanel ctx={ctx} />
          <LiquidityPanel ctx={ctx} onViewChart={onViewChart} />
          <ConfluencePanel ctx={ctx} className="@min-[560px]:col-span-2" />
          <SetupPanel ctx={ctx} />
          <DerivativesPanel ctx={ctx} onSwitchPerp={onSwitchPerp} />
          <HistoricalPanel ctx={ctx} className="@min-[560px]:col-span-2" />
        </div>
      ) : tab === "Indicators" ? (
        <Panel title="Indicadores e camadas">
          <div className="flex flex-col gap-1">
            {(Object.keys(OVERLAY_LABEL) as Array<keyof Overlays>).map((k) => (
              <label key={k} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-[13px] hover:bg-muted">
                <input type="checkbox" checked={overlays[k]} onChange={() => setOverlays({ ...overlays, [k]: !overlays[k] })} />
                {OVERLAY_LABEL[k]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Fibonacci estrutural: página Fibonacci. Perfil de volume: em desenvolvimento.</p>
        </Panel>
      ) : (
        <Panel title="Alertas">
          <p className="text-[12.5px] text-muted-foreground">Alertas de preço, indicador, padrão e volume para {ctx.symbol} ficam em Carteira → Alertas; vigilância contínua na Sentinela.</p>
          <div className="mt-3 flex gap-2">
            <Link href={`/carteira?tab=alerts&symbol=${ctx.symbol}`} className="flex h-9 flex-1 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground">
              Criar alerta
            </Link>
            <Link href="/sentinela" className="flex h-9 flex-1 items-center justify-center rounded-md border border-border text-[13px]">
              Sentinela
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Access gate */

function AccessOrError({ error, sel, onReset }: { error: unknown; sel: MarketSelection; onReset: () => void }) {
  const status = error instanceof ApiClientError ? error.status : 0;
  const next = encodeURIComponent(`/charts/${sel.symbol}?tf=${sel.timeframe}&exchange=${sel.exchange}&instrument=${sel.instrument}`);
  if (status === 401)
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-bold">Inteligência de mercado cripto em uma só tela</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gráfico, estrutura de mercado, liquidez, suporte/resistência, Confluence Score auditável, derivativos (Binance, Bybit, OKX), histórico do setup e gestão de risco — no mesmo contexto. {TRIAL_DAYS} dias grátis no PRO; depois PRO ou ELITE.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`/registro?next=${next}`} className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Testar {TRIAL_DAYS} dias grátis
          </Link>
          <Link href={`/login?next=${next}`} className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm">
            Entrar
          </Link>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">Conteúdo técnico e educacional; não é recomendação de investimento.</p>
      </div>
    );
  if (status === 402)
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-bold">Escolha seu plano</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message} Sua conta, favoritos e configurações continuam salvos.</p>
        <Link href="/planos" className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Ver planos
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <Unavailable>
        DADOS INDISPONÍVEIS — {sel.symbol}/USDT {VENUE_LABEL[sel.exchange]} {INSTRUMENT_LABEL[sel.instrument]} {TIMEFRAME_LABEL[sel.timeframe]}: {error instanceof Error ? error.message : "nenhuma fonte respondeu"}.
      </Unavailable>
      <button onClick={onReset} className="h-8 self-start rounded-md border border-border px-3 text-[12px] hover:bg-muted">
        Voltar para Binance Spot
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Workspace */

/**
 * Market Intelligence Workspace (Dashboard e Charts). Contexto global = ativo × exchange × instrumento ×
 * timeframe, na URL. Todos os painéis derivam de UM request; ao trocar qualquer parte do contexto a
 * requisição anterior é abortada e respostas de outra chave (contextKey) nunca são exibidas.
 */
export function TerminalWorkspace({ symbol: routeSymbol, mode = "dashboard" }: { symbol?: string; mode?: "dashboard" | "charts" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { selection: stored } = useActiveSelection();
  const parsed = selectionFromParams(new URLSearchParams(params.toString()), stored ?? DEFAULT_SELECTION, routeSymbol);
  const valid: MarketSelection = ASSETS.some((a) => a.symbol === parsed.symbol) ? parsed : { ...parsed, symbol: DEFAULT_SELECTION.symbol };
  const key = selectionKey(valid);
  // identidade estável por chave (evita recriar callbacks a cada render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sel = React.useMemo(() => valid, [key]);

  React.useEffect(() => {
    setActiveSelection(sel);
  }, [sel]);

  const update = React.useCallback(
    (p: Partial<MarketSelection>) => {
      const n = { ...sel, ...p };
      trackClient("context_change", { symbol: n.symbol, tf: n.timeframe, exchange: n.exchange, instrument: n.instrument });
      const q = `tf=${n.timeframe}&exchange=${n.exchange}&instrument=${n.instrument}`;
      router.replace(mode === "charts" ? `/charts/${n.symbol}?${q}` : `/?symbol=${n.symbol}&${q}`, { scroll: false });
    },
    [sel, router, mode],
  );

  // um AbortController por troca de contexto: a requisição da chave anterior é cancelada
  const ctrl = React.useRef<AbortController | null>(null);
  const fetcher = React.useCallback(async (url: string) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    return apiFetch<MarketContext>(url, { signal: c.signal });
  }, []);
  const { user, loading: sessionLoading } = useSession();
  const anon = !sessionLoading && !user;
  const url = `/api/markets/${sel.symbol}/context?tf=${sel.timeframe}&exchange=${sel.exchange}&instrument=${sel.instrument}`;
  // sem sessão não pede o contexto (evita 401 desnecessário); mostra o convite ao teste
  const { data: ctx, error, isValidating, mutate } = useSWR<MarketContext>(user ? url : null, fetcher, { refreshInterval: 30_000, keepPreviousData: false, revalidateOnFocus: false });
  const [overlaysRaw, setOverlays] = useLocalStorage<Overlays>("cs-overlays-v2", withOverlayDefaults(null));
  const overlays = withOverlayDefaults(overlaysRaw);
  const [focus, setFocus] = useLocalStorage<boolean>("cs-focus-chart", false);
  const [analysisOpen, setAnalysisOpen] = useLocalStorage<boolean>("cs-analysis-open", true);
  const { bySymbol } = useTickers();
  // preço ao vivo do stream só vale para Binance spot (mesma venue/instrumento do stream)
  const liveT = sel.exchange === "binance" && sel.instrument === "spot" ? bySymbol.get(sel.symbol) : undefined;
  const { data: setups } = useSWR<{ rows: SetupRow[] }>(ctx ? `/api/markets/setups?tf=${sel.timeframe}` : null, { revalidateOnFocus: false, refreshInterval: 120_000 });
  const trendBySymbol = React.useMemo(() => new Map((setups?.rows ?? []).map((r) => [r.symbol, r.trend])), [setups]);
  const chartRef = React.useRef<HTMLDivElement>(null);

  // o contexto exibido precisa ser exatamente o da seleção atual
  const consistent = ctx && ctx.contextKey === key ? ctx : null;
  const aborted = error instanceof DOMException && error.name === "AbortError";
  const showError = (error && !aborted && !consistent) || anon;
  const shownError = anon ? new ApiClientError(401, "unauthorized", "Faça login ou comece o teste") : error;
  const showRight = analysisOpen && !focus;
  const loggedIn = Boolean(user);
  React.useEffect(() => {
    if (loggedIn && mode === "dashboard") trackClient("dashboard_view");
  }, [loggedIn, mode]);


  return (
    <div className="flex flex-col gap-3 p-3">
      {showError ? <AccessOrError error={shownError} sel={sel} onReset={() => update({ exchange: "binance", instrument: "spot" })} /> : null}
      {!consistent && !showError ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando contexto">
          <div className="skeleton h-[108px] rounded-lg" />
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(440px,36%)]">
            <div className="skeleton h-[620px] rounded-lg" />
            <div className="skeleton h-[620px] rounded-lg" />
          </div>
        </div>
      ) : null}
      {consistent && mode === "dashboard" ? <OnboardingCard /> : null}
      {consistent ? (
        <>
          <AssetHeader ctx={consistent} sel={sel} onChange={update} live={liveT ? { price: liveT.price, changePct24h: liveT.changePct24h } : null} />
          <div className={cn("grid gap-3", showRight && "xl:grid-cols-[minmax(0,1fr)_minmax(440px,36%)]")}>
            <div ref={chartRef} className={cn("min-w-0", showRight && "xl:sticky xl:top-[68px] xl:self-start")}>
              <ChartCard
                ctx={consistent}
                tf={sel.timeframe}
                onTf={(timeframe) => update({ timeframe })}
                overlays={overlays}
                setOverlays={setOverlays}
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                focus={focus}
                onFocus={() => setFocus(!focus)}
                analysisOpen={showRight}
                onToggleAnalysis={() => {
                  if (focus) setFocus(false);
                  setAnalysisOpen(!showRight);
                }}
              />
            </div>
            {showRight ? (
              <RightColumn
                ctx={consistent}
                overlays={overlays}
                setOverlays={setOverlays}
                onSwitchPerp={() => update({ instrument: "perp" })}
                onViewChart={() => {
                  setOverlays({ ...overlays, liquidity: true, levels: true });
                  chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            ) : (
              <div className="xl:hidden">
                <RightColumn ctx={consistent} overlays={overlays} setOverlays={setOverlays} onSwitchPerp={() => update({ instrument: "perp" })} onViewChart={() => chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
              </div>
            )}
          </div>
          {!focus ? (
            <div className="grid gap-3 md:grid-cols-2 min-[1700px]:grid-cols-4">
              <WatchlistPanel selected={sel.symbol} trendBySymbol={trendBySymbol} onSelect={(symbol) => update({ symbol })} />
              <MarketOverviewPanel />
              <ScannerPanel tf={sel.timeframe} selected={sel.symbol} onSelect={(symbol) => update({ symbol })} />
              <RiskPanel key={key} ctx={consistent} />
            </div>
          ) : null}
          <p className="text-[10.5px] text-muted-foreground" data-context={consistent.contextKey}>
            Atualizado {timeAgo(consistent.generatedAt)} · renova a cada 30 s · dados da corretora selecionada (preço, candles, volume, open interest e funding); estrutura, liquidez, níveis, setup e Confluence Score são calculados sobre candles fechados.
          </p>
        </>
      ) : null}
    </div>
  );
}
