"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, CircleDot, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact, formatDateTime, formatPct, formatPrice, timeAgo } from "@/lib/format";
import type { MarketContext } from "@/services/market-context-service";

/* ------------------------------------------------------------------ primitives */

export function Panel({ title, action, children, className, bodyClassName }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-card", className)}>
      {title ? (
        <header className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
          <h2 className="truncate text-[13px] font-semibold">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function MetricRow({ icon, label, value, tone, hint }: { icon?: React.ReactNode; label: string; value: React.ReactNode; tone?: "up" | "down" | "warn" | "info" | "muted"; hint?: string }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-[12.5px]" title={hint}>
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "tabular shrink-0 text-right font-medium",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
          tone === "warn" && "text-warning",
          tone === "info" && "text-info",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Stamp({ source, timestamp, stale }: { source: string; timestamp: number | null; stale?: boolean }) {
  return (
    <p className="mt-2 flex items-center gap-1 text-[10.5px] text-muted-foreground" title={`Fonte: ${source}${timestamp ? ` · ${formatDateTime(timestamp)}` : ""}`}>
      <Info className="h-3 w-3" />
      <span className="truncate">
        {source}
        {timestamp ? ` · ${timeAgo(timestamp)}` : ""}
        {stale ? " · em cache" : ""}
      </span>
    </p>
  );
}

export function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">{children}</p>;
}

const dirTone = (d: string | null | undefined) => (d === "bullish" ? "up" : d === "bearish" ? "down" : "muted");
const DIR = (d: string | null | undefined) => (d === "bullish" ? "Bullish" : d === "bearish" ? "Bearish" : "Neutral");
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));
const zone = (z: { low: number; high: number } | null | undefined) => (z ? `${px(z.low)} – ${px(z.high)}` : "—");

/* ------------------------------------------------------------------ Market Structure */

const SEQ: Record<string, string> = { "HH HL": "Higher Highs / Higher Lows", "LH LL": "Lower Highs / Lower Lows" };
function structureText(seq: string, trend: string) {
  const labels = new Set(seq.split(" → "));
  if (labels.has("HH") && labels.has("HL")) return SEQ["HH HL"];
  if (labels.has("LH") && labels.has("LL")) return SEQ["LH LL"];
  return trend === "neutral" ? "Range / sem sequência" : seq || "—";
}

export function StructurePanel({ ctx }: { ctx: MarketContext }) {
  const s = ctx.structure;
  return (
    <Panel title="Market Structure" action={<span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}>
      <MetricRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Trend Bias" value={DIR(s.trend)} tone={dirTone(s.trend)} />
      <MetricRow label="Structure" value={<span className="text-[11.5px]">{structureText(s.sequence, s.trend)}</span>} tone={dirTone(s.trend)} hint={s.sequence} />
      <MetricRow label="Last BOS" value={s.lastBos ? `${px(s.lastBos.level)} ${DIR(s.lastBos.direction)}` : "—"} tone={dirTone(s.lastBos?.direction)} hint={s.lastBos ? formatDateTime(s.lastBos.time) : undefined} />
      <MetricRow label={`Last ${s.lastChoch?.type ?? "CHoCH"}`} value={s.lastChoch ? `${px(s.lastChoch.level)} ${DIR(s.lastChoch.direction)}` : "—"} tone={dirTone(s.lastChoch?.direction)} hint={s.lastChoch ? formatDateTime(s.lastChoch.time) : undefined} />
      <MetricRow label="Market Phase" value={s.phase} tone={s.phase === "Expansion" ? "info" : s.phase === "Reversal" ? "warn" : "muted"} />
      <Stamp {...s.stamp} />
    </Panel>
  );
}

/* ------------------------------------------------------------------ Liquidity */

export function LiquidityPanel({ ctx, onViewChart }: { ctx: MarketContext; onViewChart: () => void }) {
  const l = ctx.liquidity;
  const sweep = l.recentSweeps[0];
  return (
    <Panel title="Liquidity" action={<span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}>
      <MetricRow label="Liquidity Above" value={zone(l.above)} tone={l.above ? "down" : "muted"} hint={l.above ? `${l.above.kind} · ${l.above.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Liquidity Below" value={zone(l.below)} tone={l.below ? "up" : "muted"} hint={l.below ? `${l.below.kind} · ${l.below.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Nearest Resistance" value={ctx.levels.nearestResistance ? px(ctx.levels.nearestResistance.price) : "—"} hint={ctx.levels.nearestResistance ? `${ctx.levels.nearestResistance.touches} toques · ${ctx.levels.nearestResistance.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Nearest Support" value={ctx.levels.nearestSupport ? px(ctx.levels.nearestSupport.price) : "—"} hint={ctx.levels.nearestSupport ? `${ctx.levels.nearestSupport.touches} toques · ${ctx.levels.nearestSupport.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Recent Sweep" value={sweep ? `${px(sweep.price)} (${sweep.direction === "bullish" ? "Lower" : "Upper"})` : "none"} tone={sweep ? dirTone(sweep.direction) : "muted"} hint={sweep ? `${sweep.kind} há ${sweep.barsAgo} candles` : undefined} />
      <button onClick={onViewChart} className="mt-2 h-8 w-full rounded-md border border-primary/40 bg-primary/10 text-[12px] font-semibold text-foreground hover:bg-primary/20">
        View on Chart
      </button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Confluence */

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const color = label === "No Trade" ? "var(--danger)" : value >= 75 ? "var(--success)" : value >= 65 ? "var(--info)" : "var(--warning)";
  return (
    <svg viewBox="0 0 100 100" className="h-[112px] w-[112px]" role="img" aria-label={`Confluence Score ${value} de 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" strokeDasharray={`${arc} ${c}`} transform="rotate(135 50 50)" strokeLinecap="round" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${(arc * value) / 100} ${c}`} transform="rotate(135 50 50)" strokeLinecap="round" />
      <text x="50" y="52" textAnchor="middle" className="fill-foreground" style={{ font: "700 26px Inter, sans-serif" }}>
        {value}
      </text>
      <text x="50" y="68" textAnchor="middle" className="fill-muted-foreground" style={{ font: "500 10px Inter, sans-serif" }}>
        /100
      </text>
    </svg>
  );
}

export function ConfluencePanel({ ctx, className }: { ctx: MarketContext; className?: string }) {
  const c = ctx.confluence;
  const [open, setOpen] = React.useState(false);
  const pen = c.penalties.reduce((s, p) => s + p.points, 0);
  return (
    <Panel
      className={className}
      title="Confluence Score"
      action={
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={open}>
          Why this score {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      }
    >
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <Gauge value={c.score} label={c.label} />
          <span className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", c.verdict === "NO_TRADE" ? "bg-danger/15 text-danger" : c.score >= 75 ? "bg-success/15 text-success" : "bg-info/15 text-info")}>
            {c.label}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {c.components.map((k) => (
            <div key={k.key} className="grid grid-cols-[minmax(0,1fr)_minmax(40px,1fr)_40px] items-center gap-2 text-[11.5px]" title={k.reasons.join(" · ")}>
              <span className={cn("truncate", k.available ? "text-muted-foreground" : "text-muted-foreground/50 line-through")}>{k.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", k.score >= 0 ? "bg-success" : "bg-danger")} style={{ width: `${k.available ? (Math.abs(k.score) / k.max) * 100 : 0}%` }} />
              </span>
              <span className={cn("tabular text-right", k.score < 0 && "text-danger")}>{k.available ? `${Math.round(k.score)}/${k.max}` : "n/d"}</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(40px,1fr)_40px] items-center gap-2 text-[11.5px]">
            <span className="text-muted-foreground">Penalties</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-danger" style={{ width: `${Math.min(100, Math.abs(pen) * 5)}%` }} />
            </span>
            <span className={cn("tabular text-right", pen < 0 && "text-danger")}>{pen}</span>
          </div>
        </div>
      </div>
      {open ? (
        <div className="mt-3 space-y-1.5 border-t border-border pt-2 text-[11.5px]">
          {c.components.map((k) => (
            <p key={k.key}>
              <span className="font-semibold">{k.label}</span> <span className="tabular text-muted-foreground">({k.available ? `${k.score}/${k.max}` : "fora do cálculo"})</span>: {k.reasons.join(" · ") || "—"}
            </p>
          ))}
          {c.penalties.map((p) => (
            <p key={p.label} className="text-danger">
              {p.points} · {p.label}
            </p>
          ))}
          {c.noTradeReasons.length ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-2 text-danger">
              <span className="font-semibold">NO TRADE:</span> {c.noTradeReasons.join(" · ")}
            </div>
          ) : null}
          <p className="text-muted-foreground">Nota = soma dos componentes e penalidades ÷ máximo dos componentes disponíveis. Qualidade de confluência, não probabilidade.</p>
        </div>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ Setup Status */

const STATE_STYLE: Record<string, string> = {
  DETECTED: "bg-muted text-muted-foreground",
  FORMING: "bg-info/15 text-info",
  READY: "bg-success text-white",
  TRIGGERED: "bg-primary text-primary-foreground",
  ACTIVE: "bg-primary/20 text-foreground",
  TARGET_HIT: "bg-success/20 text-success",
  INVALIDATED: "bg-danger/20 text-danger",
  EXPIRED: "bg-muted text-muted-foreground",
};

function Check({ ok }: { ok: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", ok ? "bg-success" : "bg-muted-foreground/50")} />
      {ok ? "Yes" : "No"}
    </span>
  );
}

export function SetupPanel({ ctx }: { ctx: MarketContext }) {
  const s = ctx.setup;
  const noTrade = ctx.confluence.verdict === "NO_TRADE";
  return (
    <Panel title="Setup Status">
      {!s ? (
        <>
          <div className="mb-2 rounded-md bg-muted py-2 text-center text-sm font-bold text-muted-foreground">NO SETUP</div>
          <Unavailable>{ctx.confluence.noTradeReasons[0] ?? "Sem direção ou níveis suficientes para montar entrada, invalidação e alvo."}</Unavailable>
        </>
      ) : (
        <>
          <div className={cn("mb-2 rounded-md py-2 text-center text-sm font-bold tracking-wide", STATE_STYLE[s.state])}>{s.state.replace("_", " ")}</div>
          <MetricRow label="Direction" value={DIR(s.direction)} tone={dirTone(s.direction)} />
          <MetricRow label="Setup Detected" value={<Check ok={s.checks.setupDetected} />} />
          <MetricRow label="Structure Aligned" value={<Check ok={s.checks.structureAligned} />} />
          <MetricRow label="Confluence Met" value={<Check ok={s.checks.confluenceMet} />} />
          <MetricRow label="Awaiting Trigger" value={<Check ok={s.checks.awaitingTrigger} />} />
          <p className="mt-2 text-[11px] text-muted-foreground">{s.stateReason}</p>
          {noTrade ? <p className="mt-1 text-[11px] font-semibold text-danger">NO TRADE · {ctx.confluence.noTradeReasons.join(" · ")}</p> : null}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ Derivatives */

export function DerivativesPanel({ ctx }: { ctx: MarketContext }) {
  const d = ctx.derivatives;
  return (
    <Panel title="Derivatives" action={d ? <span className="text-[10.5px] uppercase text-muted-foreground">{d.exchange} perp</span> : null}>
      {!d ? (
        <Unavailable>{ctx.derivativesError ?? "Derivativos indisponíveis."} Preço spot segue normal.</Unavailable>
      ) : (
        <>
          <MetricRow label="Open Interest" value={<>{d.openInterestUsd != null ? formatCompact(d.openInterestUsd) : "—"} {d.openInterestChange24hPct != null ? <span className={d.openInterestChange24hPct >= 0 ? "text-success" : "text-danger"}>{formatPct(d.openInterestChange24hPct, 1)}</span> : null}</>} />
          <MetricRow
            label="OI Change (24h)"
            value={d.openInterestUsd != null && d.openInterestChange24hPct != null ? formatCompact((d.openInterestUsd * d.openInterestChange24hPct) / (100 + d.openInterestChange24hPct)) : "—"}
            tone={d.openInterestChange24hPct != null ? (d.openInterestChange24hPct >= 0 ? "up" : "down") : "muted"}
          />
          <MetricRow label="Funding Rate" value={Number.isFinite(d.fundingRate) ? `${(d.fundingRate * 100).toFixed(4)}%` : "—"} tone={d.fundingRate > 0.0005 ? "warn" : undefined} />
          <MetricRow label="Liquidations (24h)" value="n/d" tone="muted" hint={d.liquidationsNote} />
          <MetricRow label="Long/Short Ratio" value={d.longShortRatio != null ? d.longShortRatio.toFixed(2) : "n/d"} />
          <MetricRow
            label="Taker Buy/Sell"
            value={d.takerBuyVol != null && d.takerSellVol != null && d.takerBuyVol + d.takerSellVol > 0 ? `${((d.takerBuyVol / (d.takerBuyVol + d.takerSellVol)) * 100).toFixed(1)}% / ${((d.takerSellVol / (d.takerBuyVol + d.takerSellVol)) * 100).toFixed(1)}%` : "n/d"}
          />
          <Stamp {...d.stamp} />
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ Historical */

export function HistoricalPanel({ ctx, className }: { ctx: MarketContext; className?: string }) {
  const h = ctx.historical;
  const r = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`);
  const pc = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <Panel className={className} title="Historical Performance" action={<span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}>
      {!h ? (
        <Unavailable>Sem backtest para este ativo/timeframe (histórico insuficiente).</Unavailable>
      ) : (
        <>
          <MetricRow label="Total Setups" value={`${h.samples}${h.scope === "universe" ? " (30 ativos)" : ""}`} hint={h.scope === "universe" ? "Amostra do ativo abaixo de 30: usando o universo" : undefined} />
          <MetricRow label="Hit Rate (TP1)" value={pc(h.hitRate)} hint={h.hitRateCi ? `IC 95% ${pc(h.hitRateCi.low)}–${pc(h.hitRateCi.high)}` : undefined} />
          <MetricRow label="Hit Rate (1R)" value={pc(h.hit1R)} />
          <MetricRow label="Hit Rate (2R)" value={pc(h.hit2R)} />
          <MetricRow label="Expectancy" value={r(h.expectancyR)} tone={h.expectancyR != null ? (h.expectancyR > 0 ? "up" : "down") : "muted"} />
          <MetricRow label="Profit Factor" value={h.profitFactor != null ? h.profitFactor.toFixed(2) : "—"} />
          <MetricRow label="Max Drawdown" value={h.maxDrawdownR != null ? `-${h.maxDrawdownR.toFixed(1)}R` : "—"} tone="down" />
          <MetricRow label="By regime (bull / bear / range)" value={<span className="text-[11px]">{`${r(h.regime.bull)} / ${r(h.regime.bear)} / ${r(h.regime.range)}`}</span>} />
          {h.smallSample ? <p className="mt-1 text-[11px] text-warning">Amostra pequena (n &lt; {h.minSample}): não usar isoladamente.</p> : null}
          <p className="mt-1 text-[10.5px] text-muted-foreground" title={h.method}>
            Backtest walk-forward do setup · {new Date(h.fromTime).toLocaleDateString("pt-BR")}–{new Date(h.toTime).toLocaleDateString("pt-BR")}
          </p>
        </>
      )}
    </Panel>
  );
}
