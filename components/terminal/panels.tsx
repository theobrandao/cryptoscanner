"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, CircleDot, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact, formatDateTime, formatPct, formatPrice, timeAgo } from "@/lib/format";
import type { MarketContext } from "@/services/market-context-service";
import { candlesAgo, directionPt, PHASE_PT, POOL_KIND_PT, pt, REGIME_PT, SCORE_LABEL_PT, SETUP_STATE_PT } from "@/lib/display-labels";

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
const DIR = directionPt;
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));
const zone = (z: { low: number; high: number } | null | undefined) => (z ? `${px(z.low)} – ${px(z.high)}` : "—");

/* ------------------------------------------------------------------ Market Structure */

const SEQ: Record<string, string> = { "HH HL": "Topos e fundos ascendentes (HH/HL)", "LH LL": "Topos e fundos descendentes (LH/LL)" };
function structureText(seq: string, trend: string) {
  const labels = new Set(seq.split(" → "));
  if (labels.has("HH") && labels.has("HL")) return SEQ["HH HL"];
  if (labels.has("LH") && labels.has("LL")) return SEQ["LH LL"];
  return trend === "neutral" ? "Lateral / sem sequência" : seq || "—";
}

export const REGIME_TONE: Record<string, "up" | "down" | "warn" | "info" | "muted"> = { "Bull Trend": "up", "Bear Trend": "down", Range: "muted", Expansion: "info", Compression: "info", "High Volatility": "warn" };

export function StructurePanel({ ctx }: { ctx: MarketContext }) {
  const s = ctx.structure;
  return (
    <Panel title="Estrutura de mercado" action={<span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}>
      <MetricRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Viés" value={DIR(s.trend)} tone={dirTone(s.trend)} />
      <MetricRow label="Estrutura" value={<span className="text-[11.5px]">{structureText(s.sequence, s.trend)}</span>} tone={dirTone(s.trend)} hint={s.sequence} />
      <MetricRow label="Último BOS" value={s.lastBos ? `${px(s.lastBos.level)} ${DIR(s.lastBos.direction)}` : "—"} tone={dirTone(s.lastBos?.direction)} hint={s.lastBos ? formatDateTime(s.lastBos.time) : undefined} />
      <MetricRow label={`Último ${s.lastChoch?.type ?? "CHoCH"}`} value={s.lastChoch ? `${px(s.lastChoch.level)} ${DIR(s.lastChoch.direction)}` : "—"} tone={dirTone(s.lastChoch?.direction)} hint={s.lastChoch ? formatDateTime(s.lastChoch.time) : undefined} />
      <MetricRow label="Fase" value={pt(PHASE_PT, s.phase)} tone={s.phase === "Expansion" ? "info" : s.phase === "Reversal" ? "warn" : "muted"} />
      <MetricRow label="Regime" value={pt(REGIME_PT, ctx.regime.regime)} tone={REGIME_TONE[ctx.regime.regime]} hint={ctx.regime.reasons.join(" · ")} />
      <Stamp {...s.stamp} />
    </Panel>
  );
}

/* ------------------------------------------------------------------ Liquidity */

export function LiquidityPanel({ ctx, onViewChart }: { ctx: MarketContext; onViewChart: () => void }) {
  const l = ctx.liquidity;
  const sweep = l.recentSweeps[0];
  return (
    <Panel title="Liquidez" action={<span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}>
      <MetricRow label="Liquidez acima" value={zone(l.above)} tone={l.above ? "down" : "muted"} hint={l.above ? `${pt(POOL_KIND_PT, l.above.kind)} · ${l.above.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Liquidez abaixo" value={zone(l.below)} tone={l.below ? "up" : "muted"} hint={l.below ? `${pt(POOL_KIND_PT, l.below.kind)} · ${l.below.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Resistência mais próxima" value={ctx.levels.nearestResistance ? px(ctx.levels.nearestResistance.price) : "—"} hint={ctx.levels.nearestResistance ? `${ctx.levels.nearestResistance.touches} toques · ${ctx.levels.nearestResistance.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Suporte mais próximo" value={ctx.levels.nearestSupport ? px(ctx.levels.nearestSupport.price) : "—"} hint={ctx.levels.nearestSupport ? `${ctx.levels.nearestSupport.touches} toques · ${ctx.levels.nearestSupport.distanceAtr.toFixed(1)} ATR` : undefined} />
      <MetricRow label="Varredura recente" value={sweep ? `${px(sweep.price)} (${sweep.direction === "bullish" ? "fundo" : "topo"})` : "nenhuma"} tone={sweep ? dirTone(sweep.direction) : "muted"} hint={sweep ? `${pt(POOL_KIND_PT, sweep.kind)} ${candlesAgo(sweep.barsAgo)}` : undefined} />
      <button onClick={onViewChart} className="mt-2 h-8 w-full rounded-md border border-primary/40 bg-primary/10 text-[12px] font-semibold text-foreground hover:bg-primary/20">
        Ver no gráfico
      </button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Confluence */

const LABEL_STYLE: Record<string, { color: string; chip: string }> = {
  Exceptional: { color: "var(--success)", chip: "bg-success/15 text-success" },
  Strong: { color: "var(--success)", chip: "bg-success/15 text-success" },
  Good: { color: "var(--info)", chip: "bg-info/15 text-info" },
  Moderate: { color: "var(--warning)", chip: "bg-warning/15 text-warning" },
  Low: { color: "var(--muted-foreground)", chip: "bg-muted text-muted-foreground" },
};

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const color = LABEL_STYLE[label]?.color ?? "var(--muted-foreground)";
  return (
    <svg viewBox="0 0 100 100" className="h-[104px] w-[104px]" role="img" aria-label={`Confluence Score ${value} de 100 (${pt(SCORE_LABEL_PT, label)})`}>
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

/**
 * Confluence Score R2: barras por componente (0..máx), penalidades separadas e a conta explícita
 * Raw − Penalties = Final (limitado a 0–100). A conta fecha com os números exibidos.
 */
export function ConfluencePanel({ ctx, className }: { ctx: MarketContext; className?: string }) {
  const c = ctx.confluence;
  const [open, setOpen] = React.useState(false);
  const style = LABEL_STYLE[c.label] ?? LABEL_STYLE.Low;
  const clamped = Math.round(c.raw + c.penaltyTotal) !== c.score;
  return (
    <Panel
      className={className}
      title="Confluence Score"
      action={
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={open}>
          Por que esta nota {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      }
    >
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Gauge value={c.score} label={c.label} />
          <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", style?.chip)}>{pt(SCORE_LABEL_PT, c.label)}</span>
          <dl className="tabular grid grid-cols-[auto_auto] gap-x-2 text-[11px]" aria-label="Cálculo do score">
            <dt className="text-muted-foreground">Componentes</dt>
            <dd className="text-right">{c.raw.toFixed(1)}</dd>
            <dt className="text-muted-foreground">Penalidades</dt>
            <dd className={cn("text-right", c.penaltyTotal < 0 && "text-danger")}>{c.penaltyTotal.toFixed(1)}</dd>
            <dt className="font-semibold">Final</dt>
            <dd className="text-right font-semibold">{c.score}</dd>
          </dl>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {c.components.map((k) => (
            <div key={k.key} className="grid grid-cols-[minmax(0,1fr)_minmax(36px,1fr)_42px] items-center gap-2 text-[11.5px]" title={k.reasons.join(" · ")}>
              <span className={cn("truncate", k.available ? "text-muted-foreground" : "text-muted-foreground/50")}>{k.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${k.available ? (k.score / k.max) * 100 : 0}%` }} />
              </span>
              <span className="tabular text-right">{k.available ? `${Number.isInteger(k.score) ? k.score : k.score.toFixed(1)}/${k.max}` : "n/d"}</span>
            </div>
          ))}
        </div>
      </div>
      {c.verdict === "NO_TRADE" ? (
        <p className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-danger">
          <span className="font-semibold">SEM ENTRADA:</span> {c.noTradeReasons.join(" · ")}
        </p>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-1.5 border-t border-border pt-2 text-[11.5px]">
          {c.components.map((k) => (
            <p key={k.key}>
              <span className="font-semibold">{k.label}</span> <span className="tabular text-muted-foreground">({k.available ? `${k.score}/${k.max}` : `n/d, vale 0 de ${k.max}`})</span>: {k.reasons.join(" · ") || "—"}
            </p>
          ))}
          {c.penalties.length ? (
            c.penalties.map((p) => (
              <p key={p.label} className="text-danger">
                {p.points} · {p.label}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground">Sem penalidades.</p>
          )}
          <p className="text-muted-foreground">
            Final = componentes ({c.raw.toFixed(1)}) + penalidades ({c.penaltyTotal.toFixed(1)}){clamped ? ", limitado a 0–100" : ""} = {c.score}. Pesos: estrutura 20, liquidez 15, tendência maior (HTF) 15, volume 10, momento 10, derivativos 10, histórico 10, risco 10. Componente sem dado vale 0. Mede qualidade de confluência, não probabilidade.
          </p>
        </div>
      ) : null}
      <Stamp {...c.stamp} />
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
      {ok ? "Sim" : "Não"}
    </span>
  );
}

const CONDITION_LABEL: Record<string, string> = {
  NO_SETUP: "SEM SETUP",
  NEUTRAL: "NEUTRO",
  LOW_CONFLUENCE: "CONFLUÊNCIA BAIXA",
  CONFLICTING_TIMEFRAMES: "TIMEFRAMES EM CONFLITO",
  DATA_UNAVAILABLE: "DADOS INDISPONÍVEIS",
};

/** Máquina de estados do setup. Sem linguagem de ordem: descreve estado, checagens e o nível de gatilho. */
export function SetupPanel({ ctx }: { ctx: MarketContext }) {
  const s = ctx.setup;
  const c = ctx.confluence;
  const noTrade = c.verdict === "NO_TRADE";
  return (
    <Panel title="Estado do setup" action={<span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}>
      {!s ? (
        <>
          <div className="mb-2 rounded-md bg-muted py-2 text-center text-sm font-bold text-muted-foreground">{CONDITION_LABEL[c.condition] ?? "SEM SETUP"}</div>
          <Unavailable>{c.noTradeReasons[0] ?? "Sem direção ou níveis suficientes para montar zona, invalidação e alvo."}</Unavailable>
        </>
      ) : (
        <>
          <div className={cn("mb-2 rounded-md py-2 text-center text-sm font-bold tracking-wide", STATE_STYLE[s.state])}>{pt(SETUP_STATE_PT, s.state).toUpperCase()}</div>
          {c.condition !== "OK" && c.condition !== "NO_SETUP" ? <p className="mb-1 text-center text-[11px] font-semibold text-warning">{CONDITION_LABEL[c.condition]}</p> : null}
          <MetricRow label="Direção" value={DIR(s.direction)} tone={dirTone(s.direction)} />
          <MetricRow label="Setup detectado" value={<Check ok={s.checks.setupDetected} />} />
          <MetricRow label="Estrutura alinhada" value={<Check ok={s.checks.structureAligned} />} />
          <MetricRow label="Confluência ≥ 60" value={<Check ok={s.checks.confluenceMet} />} />
          <MetricRow label="Aguardando gatilho" value={<Check ok={s.checks.awaitingTrigger} />} />
          <MetricRow label="Nível de gatilho" value={s.triggerLevel ? px(s.triggerLevel.price) : "—"} tone="info" hint={s.triggerLevel?.source ?? "aguardando swing interno a favor"} />
          <MetricRow label="Zona de entrada" value={zone(s.entryZone)} hint={`nível-chave: ${s.keyLevel.source}`} />
          <MetricRow label="Invalidação" value={px(s.invalidation.price)} tone="down" hint={s.invalidation.source} />
          <p className="mt-2 text-[11px] text-muted-foreground">{s.stateReason}</p>
          {noTrade ? <p className="mt-1 text-[11px] font-semibold text-danger">SEM ENTRADA · {c.noTradeReasons.join(" · ")}</p> : null}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ Derivatives */

function useNow(ms = 30_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function countdown(to: number, now: number) {
  const s = Math.max(0, Math.round((to - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function DerivativesPanel({ ctx, onSwitchPerp }: { ctx: MarketContext; onSwitchPerp?: () => void }) {
  const d = ctx.derivatives;
  const now = useNow();
  const spot = ctx.instrument === "spot";
  return (
    <Panel title="Derivativos" action={d ? <span className="text-[10.5px] uppercase text-muted-foreground">{d.exchange} perpétuo</span> : null}>
      {spot ? (
        <>
          <Unavailable>Spot: funding, open interest e liquidações se aplicam a contratos perpétuos.</Unavailable>
          {onSwitchPerp ? (
            <button onClick={onSwitchPerp} className="mt-2 h-8 w-full rounded-md border border-border text-[12px] font-semibold hover:bg-muted">
              Mudar para perpétuo
            </button>
          ) : null}
        </>
      ) : !d ? (
        <Unavailable>{ctx.derivativesError ?? "Derivativos indisponíveis."}</Unavailable>
      ) : (
        <>
          <MetricRow label="Open Interest" value={<>{d.openInterestUsd != null ? formatCompact(d.openInterestUsd) : "—"} {d.openInterestChange24hPct != null ? <span className={d.openInterestChange24hPct >= 0 ? "text-success" : "text-danger"}>{formatPct(d.openInterestChange24hPct, 1)}</span> : null}</>} />
          <MetricRow
            label="Variação do OI (24h)"
            value={d.openInterestUsd != null && d.openInterestChange24hPct != null ? formatCompact((d.openInterestUsd * d.openInterestChange24hPct) / (100 + d.openInterestChange24hPct)) : "—"}
            tone={d.openInterestChange24hPct != null ? (d.openInterestChange24hPct >= 0 ? "up" : "down") : "muted"}
          />
          <MetricRow label="Funding" value={Number.isFinite(d.fundingRate) ? `${(d.fundingRate * 100).toFixed(4)}%` : "—"} tone={Math.abs(d.fundingRate) > 0.0005 ? "warn" : undefined} />
          <MetricRow label="Próximo funding" value={Number.isFinite(d.nextFundingTime) && d.nextFundingTime > 0 ? countdown(d.nextFundingTime, now) : "—"} hint={Number.isFinite(d.nextFundingTime) ? formatDateTime(d.nextFundingTime) : undefined} />
          <MetricRow label="Liquidações (24h)" value="n/d" tone="muted" hint={d.liquidationsNote} />
          <MetricRow label="Long/short (contas)" value={d.longShortRatio != null ? d.longShortRatio.toFixed(2) : "n/d"} />
          <MetricRow
            label="Taker compra/venda"
            value={d.takerBuyVol != null && d.takerSellVol != null && d.takerBuyVol + d.takerSellVol > 0 ? `${((d.takerBuyVol / (d.takerBuyVol + d.takerSellVol)) * 100).toFixed(1)}% / ${((d.takerSellVol / (d.takerBuyVol + d.takerSellVol)) * 100).toFixed(1)}%` : "n/d"}
          />
          <Stamp {...d.stamp} />
          <a href={`/derivatives?symbol=${ctx.symbol}&exchange=${ctx.exchange}`} className="mt-2 flex h-8 items-center justify-center rounded-md border border-border text-[12px] font-semibold hover:bg-muted">
            Ver detalhes
          </a>
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
  const d = (t: number) => new Date(t).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return (
    <Panel
      className={className}
      title="Desempenho histórico"
      action={h?.smallSample ? <span className="rounded bg-warning/15 px-1.5 text-[10.5px] font-semibold text-warning">AMOSTRA PEQUENA</span> : <span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{ctx.timeframe}</span>}
    >
      {!h ? (
        <Unavailable>Sem backtest para este ativo/timeframe (histórico insuficiente).</Unavailable>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] text-muted-foreground" title={h.method}>
            {h.scope === "universe" ? "Universo (30 ativos)" : `${ctx.symbol}/USDT`} · {ctx.timeframe.toUpperCase()} · pullback de estrutura · regime atual {pt(REGIME_PT, ctx.regime.regime).toLowerCase()} · {d(h.fromTime)}–{d(h.toTime)}
          </p>
          <div className="grid grid-cols-1 gap-x-4 @min-[520px]:grid-cols-2">
            <MetricRow label="Setups no histórico" value={String(h.samples)} hint={h.scope === "universe" ? `Amostra do ativo abaixo de ${h.minSample}: usando o universo` : undefined} />
            <MetricRow label="Expectativa" value={r(h.expectancyR)} tone={h.expectancyR != null ? (h.expectancyR > 0 ? "up" : "down") : "muted"} />
            <MetricRow label="Atingiu 1R / 2R / 3R" value={`${pc(h.hit1R)} / ${pc(h.hit2R)} / ${pc(h.hit3R)}`} hint="% das operações cuja excursão a favor atingiu 1R, 2R e 3R" />
            <MetricRow label="R médio" value={r(h.avgR)} />
            <MetricRow label="Fator de lucro" value={h.profitFactor != null ? h.profitFactor.toFixed(2) : "—"} />
            <MetricRow label="Drawdown máximo" value={h.maxDrawdownR != null ? `-${h.maxDrawdownR.toFixed(1)}R` : "—"} tone="down" />
            <MetricRow label="MFE médio" value={r(h.avgMfeR)} tone="up" hint="excursão máxima a favor, média" />
            <MetricRow label="MAE médio" value={h.avgMaeR != null ? `-${h.avgMaeR.toFixed(2)}R` : "—"} tone="down" hint="excursão máxima contra, média" />
            <MetricRow label="Acerto no TP1" value={pc(h.hitRate)} hint={h.hitRateCi ? `IC 95% ${pc(h.hitRateCi.low)}–${pc(h.hitRateCi.high)}` : undefined} />
            <MetricRow label="Alta / baixa / lateral" value={<span className="text-[11px]">{`${r(h.regime.bull)} / ${r(h.regime.bear)} / ${r(h.regime.range)}`}</span>} />
          </div>
          {h.smallSample ? <p className="mt-1 text-[11px] text-warning">Amostra pequena (n &lt; {h.minSample}): não usar isoladamente.</p> : null}
          <p className="mt-1 text-[10.5px] text-muted-foreground" title={h.method}>
            Backtest walk-forward causal · {h.dataSource} · sem taxas/slippage
          </p>
        </>
      )}
    </Panel>
  );
}
