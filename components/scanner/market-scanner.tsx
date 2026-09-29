"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AccessGate } from "@/components/account/access-gate";
import { Alert } from "@/components/ui/misc";
import { scoreTone } from "@/components/terminal/bottom-panels";
import { ASSET_CATEGORIES } from "@/lib/asset-categories";
import { formatPct, formatPrice, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/client-api";
import type { SetupRow } from "@/services/market-overview-service";
import type { ScanRow, StrategyRecord } from "@/services/strategy-service";
import type { Timeframe } from "@/types/market";

const TFS: Timeframe[] = ["15m", "30m", "1h", "4h", "1d", "1w"];
const STATES = ["DETECTED", "FORMING", "READY", "TRIGGERED", "ACTIVE", "TARGET_HIT", "INVALIDATED", "EXPIRED"] as const;
const REGIMES = ["Bull Trend", "Bear Trend", "Range", "Expansion", "Compression", "High Volatility"] as const;
type SortKey = "score" | "symbol" | "changePct24h" | "rr" | "distanceToZoneAtr" | "rsi" | "rvol" | "quoteVolume24h";

function SortTh({ k, label, right, sort, onSort }: { k: SortKey; label: string; right?: boolean; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void }) {
  return (
    <th className={cn("px-2 py-2 font-medium", right && "text-right")} aria-sort={sort.key === k ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-0.5 hover:text-foreground">
        {label}
        {sort.key === k ? sort.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));
const sel = "h-8 rounded-md border border-input bg-background px-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring";

/**
 * Market Scanner (R2): universo de 30 ativos no timeframe escolhido com estado do setup, Confluence Score,
 * regime, R:R e distância da zona; filtros combináveis e estratégia salva como filtro adicional.
 */
function ScannerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tf = (TFS.includes(params.get("tf") as Timeframe) ? params.get("tf") : "4h") as Timeframe;
  const { data, error, isValidating, mutate } = useSWR<{ rows: SetupRow[]; generatedAt: number; errors: string[] }>(`/api/markets/setups?tf=${tf}`, { refreshInterval: 120_000, revalidateOnFocus: false });
  const { data: strategies } = useSWR<{ items: StrategyRecord[] }>("/api/strategies", { revalidateOnFocus: false });
  const [direction, setDirection] = React.useState<"all" | "bullish" | "bearish">("all");
  const [operable, setOperable] = React.useState(true);
  const [minScore, setMinScore] = React.useState(0);
  const [states, setStates] = React.useState<string[]>([]);
  const [regime, setRegime] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [strategyId, setStrategyId] = React.useState("");
  const [stratRows, setStratRows] = React.useState<Map<string, ScanRow> | null>(null);
  const [stratBusy, setStratBusy] = React.useState(false);
  const [stratError, setStratError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!strategyId) return;
    let alive = true;
    const t = setTimeout(async () => {
      setStratBusy(true);
      setStratError(null);
      try {
        const r = await postJson<{ rows: ScanRow[] }>("/api/strategies/scan", { id: strategyId });
        if (alive) setStratRows(new Map(r.rows.map((x) => [x.symbol, x])));
      } catch (err) {
        if (alive) setStratError((err as Error).message);
      } finally {
        if (alive) setStratBusy(false);
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [strategyId]);

  const rows = React.useMemo(() => {
    const cat = category === "all" ? null : new Set(ASSET_CATEGORIES[category] ?? []);
    const list = (data?.rows ?? []).filter(
      (r) =>
        (!operable || r.verdict !== "NO_TRADE") &&
        (direction === "all" || r.direction === direction) &&
        r.score >= minScore &&
        (!states.length || (r.state && states.includes(r.state))) &&
        (regime === "all" || r.regime === regime) &&
        (!cat || cat.has(r.symbol)) &&
        (!strategyId || !stratRows || stratRows.get(r.symbol)?.pass),
    );
    const k = sort.key;
    return [...list].sort((a, b) => {
      const va = a[k] as number | string | null;
      const vb = b[k] as number | string | null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  }, [data, operable, direction, minScore, states, regime, category, sort, strategyId, stratRows]);

  const onSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : -1 }));
  const th = (k: SortKey, label: string, right?: boolean) => <SortTh k={k} label={label} right={right} sort={sort} onSort={onSort} />;

  return (
    <PageShell className="max-w-[1600px]">
      <PageTitle
        title="Market Scanner"
        description="30 ativos × timeframe: estado do setup, Confluence Score (0–100), regime, R:R e distância da zona. Binance spot, candles fechados. Ranking técnico — não é recomendação."
        actions={
          <>
            <Link href="/scanner/padroes" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] hover:bg-muted">
              Padrões gráficos
            </Link>
            <button onClick={() => void mutate()} className="grid h-9 w-9 place-items-center rounded-md border border-border hover:bg-muted" aria-label="Atualizar">
              <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} />
            </button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <div className="flex gap-0.5" role="tablist" aria-label="Timeframe">
          {TFS.map((t) => (
            <button key={t} role="tab" aria-selected={t === tf} onClick={() => router.replace(`/scanner?tf=${t}`, { scroll: false })} className={cn("h-8 rounded px-2.5 text-[12px] font-medium", t === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <select aria-label="Direção" className={sel} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
          <option value="all">Direção: todas</option>
          <option value="bullish">Bullish</option>
          <option value="bearish">Bearish</option>
        </select>
        <select aria-label="Regime" className={sel} value={regime} onChange={(e) => setRegime(e.target.value)}>
          <option value="all">Regime: todos</option>
          {REGIMES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select aria-label="Categoria" className={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Categoria: todas</option>
          {Object.keys(ASSET_CATEGORIES).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px]">
          Score ≥
          <input type="number" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value))))} className={cn(sel, "w-16")} aria-label="Score mínimo" />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" checked={operable} onChange={(e) => setOperable(e.target.checked)} /> Ocultar NO TRADE
        </label>
        <select aria-label="Estratégia" className={sel} value={strategyId} onChange={(e) => (setStrategyId(e.target.value), setStratRows(null))}>
          <option value="">Estratégia: nenhuma</option>
          {(strategies?.items ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {stratBusy ? <span className="text-[11.5px] text-muted-foreground">avaliando estratégia…</span> : null}
      </div>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Estados do setup">
        {STATES.map((s) => (
          <button key={s} aria-pressed={states.includes(s)} onClick={() => setStates((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} className={cn("h-7 rounded-full border px-2.5 text-[11px]", states.includes(s) ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {s.replace("_", " ")}
          </button>
        ))}
      </div>
      {error ? <Alert variant="danger">{(error as Error).message}</Alert> : null}
      {stratError ? <Alert variant="warning" className="mb-2">{stratError}</Alert> : null}
      {!data && !error ? <div className="skeleton h-96 rounded-lg" aria-busy="true" /> : null}
      {data ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1100px] whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
              <tr>
                {th("symbol", "Ativo")}
                {th("changePct24h", "24h", true)}
                <th className="px-2 py-2 font-medium">Setup</th>
                <th className="px-2 py-2 font-medium">Regime</th>
                {th("score", "Score", true)}
                {th("rr", "R:R", true)}
                {th("distanceToZoneAtr", "Dist. zona (ATR)", true)}
                <th className="px-2 py-2 text-right font-medium">Zona</th>
                <th className="px-2 py-2 text-right font-medium">Trigger</th>
                <th className="px-2 py-2 text-right font-medium">Stop</th>
                <th className="px-2 py-2 text-right font-medium">TP1</th>
                {th("rsi", "RSI", true)}
                {th("rvol", "RVOL", true)}
                {strategyId ? <th className="px-2 py-2 text-right font-medium">Estratégia</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = stratRows?.get(r.symbol);
                return (
                  <tr key={r.symbol} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-2 py-1.5">
                      <Link href={`/?symbol=${r.symbol}&tf=${tf}&exchange=binance&instrument=spot`} className="font-semibold hover:underline">
                        {r.symbol}/USDT
                      </Link>
                      <span className="ml-2 text-muted-foreground">{px(r.price)}</span>
                    </td>
                    <td className={cn("tabular px-2 py-1.5 text-right", (r.changePct24h ?? 0) >= 0 ? "text-success" : "text-danger")}>{r.changePct24h != null ? formatPct(r.changePct24h) : "—"}</td>
                    <td className={cn("px-2 py-1.5", r.direction === "bullish" ? "text-success" : r.direction === "bearish" ? "text-danger" : "text-muted-foreground")}>
                      {r.verdict === "NO_TRADE" ? <span className="text-muted-foreground">NO TRADE · {r.noTradeCode ?? r.condition.replace("_", " ")}</span> : `${r.direction === "bullish" ? "Bullish" : "Bearish"} · ${(r.state ?? "—").replace("_", " ")}`}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.regime}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={cn("tabular inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold", scoreTone(r.score))} title={r.label}>
                        {r.score}
                      </span>
                    </td>
                    <td className="tabular px-2 py-1.5 text-right">{r.rr != null ? r.rr.toFixed(2) : "—"}</td>
                    <td className="tabular px-2 py-1.5 text-right">{r.distanceToZoneAtr != null ? r.distanceToZoneAtr.toFixed(2) : "—"}</td>
                    <td className="tabular px-2 py-1.5 text-right text-muted-foreground">{r.entryLow != null ? `${px(r.entryLow)}–${px(r.entryHigh)}` : "—"}</td>
                    <td className="tabular px-2 py-1.5 text-right text-info">{px(r.triggerLevel)}</td>
                    <td className="tabular px-2 py-1.5 text-right text-danger">{px(r.stop)}</td>
                    <td className="tabular px-2 py-1.5 text-right text-success">{px(r.tp1)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{r.rsi != null ? r.rsi.toFixed(1) : "—"}</td>
                    <td className="tabular px-2 py-1.5 text-right">{r.rvol != null ? `${r.rvol.toFixed(2)}×` : "—"}</td>
                    {strategyId ? (
                      <td className={cn("tabular px-2 py-1.5 text-right", st?.pass ? "text-success" : "text-muted-foreground")}>{st ? `${st.passedConditions}/${st.totalConditions}` : "…"}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-4 text-[12.5px] text-muted-foreground">Nenhum ativo com esses filtros agora. Desmarque “Ocultar NO TRADE” ou reduza o score mínimo.</p> : null}
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            {rows.length} de {data.rows.length} ativos · gerado {timeAgo(data.generatedAt)} · atualiza a cada 2 min{data.errors.length ? ` · sem dados: ${data.errors.map((e) => e.split(":")[0]).join(", ")}` : ""}
          </p>
        </div>
      ) : null}
    </PageShell>
  );
}

export function MarketScanner() {
  return (
    <AccessGate feature="Market Scanner">
      <ScannerInner />
    </AccessGate>
  );
}
