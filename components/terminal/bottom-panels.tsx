"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Star } from "lucide-react";
import { Panel, Unavailable } from "@/components/terminal/panels";
import { useTickers } from "@/hooks/use-tickers";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSession } from "@/hooks/use-session";
import { ASSETS } from "@/lib/assets";
import { ASSET_CATEGORIES } from "@/lib/asset-categories";
import { liquidationPrice, positionSize } from "@/lib/engines/risk";
import { formatCompact, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketContext } from "@/services/market-context-service";
import type { MarketOverview, SetupRow } from "@/services/market-overview-service";
import type { Timeframe } from "@/types/market";
import type { Instrument } from "@/lib/venues";
import { directionPt, pt, SCORE_LABEL_PT, SETUP_STATE_PT } from "@/lib/display-labels";

const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));

function Tabs<T extends string>({ items, value, onChange, className, labels }: { items: readonly T[]; value: T; onChange: (v: T) => void; className?: string; labels?: Partial<Record<T, string>> }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto", className)} role="tablist">
      {items.map((i) => (
        <button key={i} role="tab" aria-selected={i === value} onClick={() => onChange(i)} className={cn("h-7 shrink-0 rounded px-2.5 text-[11.5px]", i === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          {labels?.[i] ?? i}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Watchlist */

const WL_TABS = ["All", "Majors", "Layer 1", "DeFi", "AI", "Memes", "Custom"] as const;
const WL_LABEL: Partial<Record<(typeof WL_TABS)[number], string>> = { All: "Todos", Majors: "Principais", AI: "IA", Custom: "Minha lista" };

export function WatchlistPanel({ selected, trendBySymbol, onSelect }: { selected: string; trendBySymbol: Map<string, string>; onSelect: (symbol: string) => void }) {
  const { bySymbol } = useTickers();
  const { user } = useSession();
  const [tab, setTab] = useLocalStorage<(typeof WL_TABS)[number]>("cs-wl-tab", "All");
  const { data: wl } = useSWR<{ items: Array<{ symbol: string }> }>(user && tab === "Custom" ? "/api/watchlist" : null);
  const custom = wl?.items?.map((i) => i.symbol) ?? [];
  const symbols = tab === "All" ? ASSETS.map((a) => a.symbol) : tab === "Custom" ? custom : [...(ASSET_CATEGORIES[tab] ?? [])];
  return (
    <Panel
      title="Favoritos"
      action={
        <Link href="/carteira" className="grid h-7 w-7 place-items-center rounded hover:bg-muted" aria-label="Gerenciar favoritos">
          <Plus className="h-4 w-4" />
        </Link>
      }
      bodyClassName="p-0"
    >
      <Tabs items={WL_TABS} labels={WL_LABEL} value={tab} onChange={setTab} className="border-b border-border px-2 py-1.5" />
      {tab === "Custom" && !user ? <div className="p-3"><Unavailable>Entre para usar sua lista de favoritos.</Unavailable></div> : null}
      {tab === "Custom" && user && symbols.length === 0 ? <div className="p-3"><Unavailable>Lista vazia. Adicione ativos em Carteira.</Unavailable></div> : null}
      <div className="max-h-[280px] overflow-y-auto">
        <table className="w-full whitespace-nowrap text-[12px]">
          <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Ativo</th>
              <th className="px-2 py-1.5 text-right font-medium">Preço</th>
              <th className="px-2 py-1.5 text-right font-medium">24h %</th>
              <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Volume</th>
              <th className="px-3 py-1.5 text-right font-medium">Tendência</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => {
              const t = bySymbol.get(s);
              const a = ASSETS.find((x) => x.symbol === s);
              const trend = trendBySymbol.get(s);
              return (
                <tr key={s} onClick={() => onSelect(s)} className={cn("cursor-pointer border-t border-border/60 hover:bg-muted/50", s === selected && "bg-primary/10")} aria-selected={s === selected}>
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <Star className="h-3 w-3 text-muted-foreground" />
                      <span className="w-4 text-center text-muted-foreground">{a?.glyph}</span>
                      <span className="font-medium">{s}/USDT</span>
                    </span>
                  </td>
                  <td className="tabular px-2 py-1.5 text-right">{px(t?.price)}</td>
                  <td className={cn("tabular px-2 py-1.5 text-right", t && t.changePct24h >= 0 ? "text-success" : "text-danger")}>{t ? formatPct(t.changePct24h) : "—"}</td>
                  <td className="tabular hidden px-2 py-1.5 text-right text-muted-foreground sm:table-cell">{t ? formatCompact(t.quoteVolume24h, "") : "—"}</td>
                  <td className={cn("px-3 py-1.5 text-right text-[11px]", trend === "bullish" ? "text-success" : trend === "bearish" ? "text-danger" : "text-muted-foreground")} title="Estrutura externa no timeframe atual">
                    {trend === "bullish" ? "▲ Alta" : trend === "bearish" ? "▼ Baixa" : trend ? "Lateral" : "…"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Market Overview */

const MO_TABS = ["Top Gainers", "Top Losers", "Volume Leaders", "Market Cap"] as const;
const MO_LABEL: Record<(typeof MO_TABS)[number], string> = { "Top Gainers": "Maiores altas", "Top Losers": "Maiores quedas", "Volume Leaders": "Maior volume", "Market Cap": "Capitalização" };
const FG_PT: Record<string, string> = { "Extreme Fear": "Medo extremo", Fear: "Medo", Neutral: "Neutro", Greed: "Ganância", "Extreme Greed": "Ganância extrema" };

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const color = value >= 75 ? "var(--success)" : value >= 55 ? "var(--info)" : value >= 45 ? "var(--muted-foreground)" : value >= 25 ? "var(--warning)" : "var(--danger)";
  return (
    <svg viewBox="0 0 100 60" className="h-12 w-20" role="img" aria-label={`Índice de medo e ganância ${value} (${FG_PT[label] ?? label})`}>
      <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="var(--muted)" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(value / 100) * 125.6} 200`} />
      <text x="50" y="50" textAnchor="middle" className="fill-foreground" style={{ font: "700 18px Inter, sans-serif" }}>
        {value}
      </text>
    </svg>
  );
}

export function MarketOverviewPanel() {
  const { data } = useSWR<MarketOverview>("/api/markets/overview", { refreshInterval: 120_000 });
  const [tab, setTab] = React.useState<(typeof MO_TABS)[number]>("Top Gainers");
  const rows = tab === "Top Gainers" ? data?.topGainers : tab === "Top Losers" ? data?.topLosers : tab === "Volume Leaders" ? data?.volumeLeaders : data?.marketCapLeaders;
  const fin = (v: number | undefined) => v != null && Number.isFinite(v);
  const g = data?.global;
  return (
    <Panel title="Visão do mercado" action={<span className="text-[11px] text-muted-foreground">24h</span>} bodyClassName="p-0">
      <div className="grid grid-cols-2 gap-2 p-3">
        <Tile label="Capitalização total" value={g && fin(g.totalMarketCapUsd) ? formatCompact(g.totalMarketCapUsd) : "—"} sub={g && fin(g.marketCapChange24hPct) ? formatPct(g.marketCapChange24hPct) : null} up={g ? g.marketCapChange24hPct >= 0 : undefined} title={g ? `${g.source}${g.stale ? " (cache)" : ""}` : "indisponível"} />
        <Tile label="Volume 24h" value={g && fin(g.totalVolumeUsd) ? formatCompact(g.totalVolumeUsd) : "—"} title={g?.source} />
        <Tile label="Dominância BTC" value={g && fin(g.btcDominance) ? `${g.btcDominance.toFixed(1)}%` : "—"} sub={g && fin(g.ethDominance) ? `ETH ${g.ethDominance.toFixed(1)}%` : null} title={g?.source} />
        <div className="rounded-md border border-border p-2" title={data?.fearGreed ? `${data.fearGreed.source}${data.fearGreed.stale ? " (cache)" : ""}` : "indisponível"}>
          <div className="text-[10.5px] text-muted-foreground">Medo e ganância</div>
          {data?.fearGreed ? (
            <div className="flex items-end gap-1">
              <FearGreedGauge value={data.fearGreed.value} label={data.fearGreed.classification} />
              <span className="pb-1 text-[10.5px] text-muted-foreground">{FG_PT[data.fearGreed.classification] ?? data.fearGreed.classification}</span>
            </div>
          ) : (
            <div className="text-sm font-semibold">—</div>
          )}
        </div>
      </div>
      <Tabs items={MO_TABS} labels={MO_LABEL} value={tab} onChange={setTab} className="border-y border-border px-2 py-1.5" />
      <div className="max-h-[190px] overflow-y-auto">
        <table className="w-full whitespace-nowrap text-[12px]">
          <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Ativo</th>
              <th className="px-2 py-1.5 text-right font-medium">Preço</th>
              <th className="px-2 py-1.5 text-right font-medium">24h %</th>
              <th className="px-3 py-1.5 text-right font-medium">{tab === "Market Cap" ? "Capitalização" : "Volume"}</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, i) => (
              <tr key={r.symbol + i} className="border-t border-border/60">
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium">{r.symbol}</td>
                <td className="tabular px-2 py-1.5 text-right">{px(r.price)}</td>
                <td className={cn("tabular px-2 py-1.5 text-right", (r.changePct24h ?? 0) >= 0 ? "text-success" : "text-danger")}>{r.changePct24h != null ? formatPct(r.changePct24h) : "—"}</td>
                <td className="tabular px-3 py-1.5 text-right text-muted-foreground">{formatCompact(tab === "Market Cap" ? r.marketCap : r.volume24h, "$")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !rows?.length ? <div className="p-3"><Unavailable>Ranking indisponível (fontes de mercado sem resposta).</Unavailable></div> : null}
        {data?.moversSource ? <p className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">Fonte: {data.moversSource.source}{data.moversSource.stale ? " · cache" : ""}</p> : null}
      </div>
    </Panel>
  );
}

function Tile({ label, value, sub, up, title }: { label: string; value: string; sub?: string | null; up?: boolean; title?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border p-2" title={title}>
      <div className="truncate text-[10.5px] text-muted-foreground">{label}</div>
      <div className="tabular truncate text-[17px] font-bold">{value}</div>
      {sub ? <div className={cn("tabular text-[11px]", up == null ? "text-muted-foreground" : up ? "text-success" : "text-danger")}>{sub}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Market Scanner (preview: Top Setups) */

/** Faixas do Confluence Score (iguais às do motor): Low < 40 ≤ Moderate < 60 ≤ Good < 75 ≤ Strong < 90 ≤ Exceptional. */
export function scoreTone(score: number) {
  return score >= 75 ? "bg-success/20 text-success" : score >= 60 ? "bg-info/20 text-info" : score >= 40 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground";
}

export function ScannerPanel({ tf, selected, onSelect }: { tf: Timeframe; selected: string; onSelect: (symbol: string) => void }) {
  const { data, error } = useSWR<{ rows: SetupRow[]; generatedAt: number }>(`/api/markets/setups?tf=${tf}`, { refreshInterval: 120_000, revalidateOnFocus: false });
  const rows = (data?.rows ?? []).filter((r) => r.verdict !== "NO_TRADE").slice(0, 8);
  return (
    <Panel
      title="Scanner de setups · melhores notas"
      action={
        <Link href={`/scanner?tf=${tf}`} className="text-[11px] text-muted-foreground hover:text-foreground">
          Abrir scanner →
        </Link>
      }
      bodyClassName="p-0"
    >
      {error ? <div className="p-3"><Unavailable>Scanner indisponível no momento. Tente novamente.</Unavailable></div> : null}
      {!data && !error ? <div className="skeleton m-3 h-40 rounded-md" /> : null}
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full whitespace-nowrap text-[12px]">
          <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Ativo</th>
              <th className="px-2 py-1.5 font-medium">Setup</th>
              <th className="px-2 py-1.5 text-right font-medium">R:R</th>
              <th className="px-3 py-1.5 text-right font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.symbol} onClick={() => onSelect(r.symbol)} className={cn("cursor-pointer border-t border-border/60 hover:bg-muted/50", r.symbol === selected && "bg-primary/10")}>
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium">{r.symbol}/USDT</td>
                <td className={cn("px-2 py-1.5 text-[11px]", r.direction === "bullish" ? "text-success" : r.direction === "bearish" ? "text-danger" : "text-muted-foreground")}>
                  {directionPt(r.direction)} · {pt(SETUP_STATE_PT, r.state).toLowerCase()}
                </td>
                <td className="tabular px-2 py-1.5 text-right text-muted-foreground">{r.rr != null ? r.rr.toFixed(1) : "—"}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className={cn("tabular inline-block min-w-8 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold", scoreTone(r.score))} title={pt(SCORE_LABEL_PT, r.label)}>
                    {r.score}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && rows.length === 0 ? <div className="p-3"><Unavailable>Nenhum setup operável agora no {tf.toUpperCase()} (todos sem entrada).</Unavailable></div> : null}
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">Binance spot · ranking técnico por Confluence Score, não é recomendação.</p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Risk Management */

export function RiskPanel({ ctx }: { ctx: MarketContext }) {
  const s = ctx.setup;
  const perp = (ctx.instrument as Instrument) === "perp";
  const [side, setSide] = React.useState<"long" | "short">(s?.direction === "bearish" ? "short" : "long");
  const [account, setAccount] = useLocalStorage("cs-risk-account", "10000");
  const [riskPct, setRiskPct] = useLocalStorage("cs-risk-pct", "1");
  const [levRaw, setLev] = useLocalStorage("cs-risk-lev", "5");
  const [mmr] = useLocalStorage("cs-risk-mmr", "0.5");
  const lev = perp ? levRaw : "1";
  const matches = s && ((side === "long" && s.direction === "bullish") || (side === "short" && s.direction === "bearish"));
  let size: ReturnType<typeof positionSize> | null = null;
  if (matches && s) {
    try {
      size = positionSize({ account: Number(account), riskPct: Number(riskPct), entry: s.idealEntry, stop: s.stop, target: s.targets[0]?.price, leverage: Number(lev) });
    } catch {
      size = null;
    }
  }
  const liq = perp && matches && s && size ? liquidationPrice({ side, entry: s.idealEntry, qty: size.qty, leverage: Number(lev), mmr: Number(mmr) / 100 }) : null;
  const q = matches && s ? `?entry=${s.idealEntry.toPrecision(8)}&stop=${s.stop.toPrecision(8)}&target=${s.targets[0]?.price.toPrecision(8) ?? ""}&symbol=${ctx.symbol}` : "";
  return (
    <Panel
      title="Gestão de risco"
      action={
        <div className="flex rounded-md border border-border p-0.5 text-[11.5px]" role="tablist" aria-label="Lado">
          {(["long", "short"] as const).map((x) => (
            <button key={x} role="tab" aria-selected={side === x} onClick={() => setSide(x)} className={cn("h-6 rounded px-3", side === x ? (x === "long" ? "bg-success/25 text-success" : "bg-danger/25 text-danger") : "text-muted-foreground")}>
              {x === "long" ? "Compra" : "Venda"}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-2 grid grid-cols-3 gap-2 text-[11px]">
        <NumField label="Saldo ($)" value={account} onChange={setAccount} min={1} />
        <NumField label="Risco %" value={riskPct} onChange={setRiskPct} min={0.1} max={10} step={0.1} />
        <NumField label="Alavancagem" value={lev} onChange={setLev} min={1} max={125} disabled={!perp} hint={perp ? undefined : "Spot: sem alavancagem"} />
      </div>
      {!matches || !s ? (
        <Unavailable>Sem setup {side === "long" ? "comprado" : "vendido"} neste contexto. Use a calculadora para níveis próprios.</Unavailable>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2 min-[1700px]:grid-cols-1">
          <Row k="Zona de entrada" v={`${px(s.entryZone.low)} – ${px(s.entryZone.high)}`} />
          <Row k="Risco/retorno" v={s.rr != null ? `1:${s.rr.toFixed(1)}` : "—"} tone={s.rr != null && s.rr >= 2 ? "up" : s.rr != null && s.rr < 1 ? "down" : undefined} />
          <Row k="Stop" v={px(s.stop)} tone="down" />
          <Row k="Tamanho da posição" v={size ? `${size.qty.toPrecision(4)} ${ctx.symbol}` : "—"} />
          {s.targets.map((t) => (
            <Row key={t.label} k={`Alvo ${t.label.slice(2)}`} v={`${px(t.price)} (+${t.r.toFixed(1)}R)`} tone="up" hint={t.source} />
          ))}
          <Row k="Risco por operação" v={`${riskPct}% ($ ${size ? size.capitalAtRisk.toFixed(0) : "—"})`} />
          <Row k="Margem necessária" v={size ? `$ ${(size.notional / Number(lev)).toFixed(0)}` : "—"} hint="notional ÷ alavancagem" />
          <Row k="Preço de liquidação (est.)" v={perp ? (liq ? px(liq) : "—") : "n/a (à vista)"} tone={perp ? "warn" : undefined} hint={perp ? `Estimativa: fórmula Binance isolated, MMR ${mmr}%; a exchange usa tiers e mark price` : "Spot sem alavancagem não tem liquidação"} />
        </div>
      )}
      <Link href={`/risco${q}`} className="mt-3 flex h-9 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground hover:brightness-110">
        Calcular tamanho da posição
      </Link>
    </Panel>
  );
}

function NumField({ label, value, onChange, min, max, step, disabled, hint }: { label: string; value: string; onChange: (v: string) => void; min?: number; max?: number; step?: number; disabled?: boolean; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5" title={hint}>
      <span className="truncate text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="tabular h-7 w-full rounded border border-input bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
    </label>
  );
}

function Row({ k, v, tone, hint }: { k: string; v: string; tone?: "up" | "down" | "warn"; hint?: string }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2" title={hint}>
      <span className="truncate text-muted-foreground">{k}</span>
      <span className={cn("tabular shrink-0 font-medium", tone === "up" && "text-success", tone === "down" && "text-danger", tone === "warn" && "text-warning")}>{v}</span>
    </div>
  );
}
