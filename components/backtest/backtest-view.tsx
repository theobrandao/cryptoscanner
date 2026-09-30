"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ColorType, createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { FlaskConical } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AccessGate, useAccess } from "@/components/account/access-gate";
import { Alert } from "@/components/ui/misc";
import { useTheme } from "@/components/providers/theme-provider";
import { ApiClientError, postJson } from "@/lib/client-api";
import { ASSETS } from "@/lib/assets";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INSTRUMENT_LABEL, INSTRUMENTS, VENUE_LABEL, VENUES, type Instrument, type Venue } from "@/lib/venues";
import type { BacktestResponse } from "@/services/backtest-service";
import type { StrategyRecord } from "@/services/strategy-service";
import type { Timeframe } from "@/types/market";

const TFS: Timeframe[] = ["15m", "30m", "1h", "4h", "1d"];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring";
const r2 = (v: number | null | undefined, suffix = "R") => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}${suffix}`);
const pc = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function EquityChart({ data }: { data: BacktestResponse }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  React.useEffect(() => {
    const el = ref.current;
    if (!el || data.equity.length < 2) return;
    const dark = theme === "dark";
    const grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    const chart = createChart(el, {
      autoSize: true,
      height: 280,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#8193a8" : "#5b6778", fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, timeVisible: true },
      localization: { locale: "pt-BR", priceFormatter: (p: number) => `${p.toFixed(1)}%` },
    });
    // tempos estritamente crescentes (várias saídas no mesmo candle)
    let lastT = 0;
    const pts = data.equity.map((e) => {
      const t = Math.max(lastT + 1, Math.floor(e.time / 1000));
      lastT = t;
      return { t: t as UTCTimestamp, eq: e.equityPct, dd: e.drawdownPct };
    });
    const eq = chart.addSeries(LineSeries, { color: "#2f6bff", lineWidth: 2, priceLineVisible: false, title: "Capital %" });
    eq.setData(pts.map((p) => ({ time: p.t, value: p.eq })));
    const dd = chart.addSeries(LineSeries, { color: "#ea3943", lineWidth: 1, priceLineVisible: false, title: "Drawdown %" });
    dd.setData(pts.map((p) => ({ time: p.t, value: p.dd })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, theme]);
  return <div ref={ref} className="h-[280px] w-full" role="img" aria-label="Curva de capital e drawdown" />;
}

function Metric({ k, v, tone, hint }: { k: string; v: string; tone?: "up" | "down"; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-2" title={hint}>
      <div className="text-[10.5px] text-muted-foreground">{k}</div>
      <div className={cn("tabular text-[16px] font-bold", tone === "up" && "text-success", tone === "down" && "text-danger")}>{v}</div>
    </div>
  );
}

function BacktestInner() {
  const params = useSearchParams();
  const { access } = useAccess();
  const { data: strategies } = useSWR<{ items: StrategyRecord[] }>("/api/strategies", { revalidateOnFocus: false });
  const [mode, setMode] = React.useState<"setup" | "strategy">(params.get("strategy") ? "strategy" : "setup");
  const [strategyId, setStrategyId] = React.useState(params.get("strategy") ?? "");
  const [symbol, setSymbol] = React.useState((params.get("symbol") ?? "BTC").toUpperCase());
  const [tf, setTf] = React.useState<Timeframe>("4h");
  const [exchange, setExchange] = React.useState<Venue>("binance");
  const [instrument, setInstrument] = React.useState<Instrument>("spot");
  const [days, setDays] = React.useState(180);
  const [feeBps, setFee] = React.useState(10);
  const [slippageBps, setSlip] = React.useState(5);
  const [funding, setFunding] = React.useState(0.01);
  const [delay, setDelay] = React.useState(0);
  const [riskPct, setRisk] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [res, setRes] = React.useState<BacktestResponse | null>(null);
  const maxDays = access?.entitlements.historyDays ?? 180;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setRes(
        await postJson<BacktestResponse>("/api/backtest/run", {
          symbol,
          exchange,
          instrument,
          mode,
          timeframe: tf,
          strategyId: mode === "strategy" ? strategyId : undefined,
          days: Math.min(days, maxDays),
          feeBps,
          slippageBps,
          fundingPct8h: funding,
          entryDelay: delay,
          riskPct,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const m = res?.metrics;
  return (
    <PageShell className="max-w-[1500px]">
      <PageTitle
        title="Backtest"
        description="Setup do CryptoScanner ou estratégia salva sobre o histórico, com taxas, slippage, funding do perpétuo e atraso de entrada. Walk-forward causal (só candles fechados no instante do sinal). Resultados em R líquido de custos."
        actions={
          <Link href="/estatisticas" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] hover:bg-muted">
            Estatística de padrões
          </Link>
        }
      />
      <section className="mb-4 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-md border border-border p-0.5 text-[12.5px]" role="radiogroup" aria-label="Modo">
            {(["setup", "strategy"] as const).map((k) => (
              <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cn("h-8 rounded px-3", mode === k ? "bg-primary/15 font-semibold" : "text-muted-foreground")}>
                {k === "setup" ? "Setup CryptoScanner" : "Estratégia salva"}
              </button>
            ))}
          </div>
          {mode === "strategy" ? (
            <select aria-label="Estratégia" className={sel} value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
              <option value="">Escolha a estratégia</option>
              {(strategies?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <select aria-label="Timeframe" className={sel} value={tf} onChange={(e) => setTf(e.target.value as Timeframe)}>
              {TFS.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Ativo" className={sel} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {ASSETS.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol}/USDT
              </option>
            ))}
          </select>
          <select aria-label="Exchange" className={sel} value={exchange} onChange={(e) => setExchange(e.target.value as Venue)}>
            {VENUES.map((v) => (
              <option key={v} value={v}>
                {VENUE_LABEL[v]}
              </option>
            ))}
          </select>
          <select aria-label="Instrumento" className={sel} value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)}>
            {INSTRUMENTS.map((v) => (
              <option key={v} value={v}>
                {INSTRUMENT_LABEL[v]}
              </option>
            ))}
          </select>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Dias (máx. {maxDays})
            <input type="number" min={30} max={maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} className={cn(sel, "w-24")} />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Taxa/lado (bps)
            <input type="number" min={0} max={100} step={0.5} value={feeBps} onChange={(e) => setFee(Number(e.target.value))} className={cn(sel, "w-24")} />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Slippage/lado (bps)
            <input type="number" min={0} max={100} step={0.5} value={slippageBps} onChange={(e) => setSlip(Number(e.target.value))} className={cn(sel, "w-24")} />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Funding/8h (%)
            <input type="number" min={-0.5} max={0.5} step={0.001} value={funding} disabled={instrument !== "perp"} onChange={(e) => setFunding(Number(e.target.value))} className={cn(sel, "w-24 disabled:opacity-50")} />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Atraso (candles)
            <input type="number" min={0} max={5} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className={cn(sel, "w-20")} />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Risco/operação (%)
            <input type="number" min={0.1} max={10} step={0.1} value={riskPct} onChange={(e) => setRisk(Number(e.target.value))} className={cn(sel, "w-20")} />
          </label>
          <button onClick={() => void run()} disabled={busy || (mode === "strategy" && !strategyId)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
            <FlaskConical className="h-4 w-4" /> {busy ? "Rodando…" : "Rodar backtest"}
          </button>
        </div>
        {!access?.entitlements.elite ? <p className="mt-2 text-[11px] text-muted-foreground">Estratégias com mais de um timeframe: plano ELITE. Histórico do seu plano: {maxDays} dias.</p> : null}
      </section>
      {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}
      {res && m ? (
        <div className="flex flex-col gap-4">
          <div className="text-[12.5px] text-muted-foreground">
            {res.params.strategyName} · {res.params.symbol}/USDT {res.params.timeframe.toUpperCase()} · {VENUE_LABEL[res.params.exchange]} {INSTRUMENT_LABEL[res.params.instrument]} · {new Date(res.fromTime).toLocaleDateString("pt-BR")}–{new Date(res.toTime).toLocaleDateString("pt-BR")} · {res.bars} candles · {res.signals} sinais
          </div>
          {m.samples < 30 ? <Alert variant="warning">Amostra pequena: {m.samples} operações. Não use o resultado isoladamente.</Alert> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <Metric k="Operações" v={String(m.samples)} />
            <Metric k="Expectativa líquida" v={r2(m.expectancyR)} tone={(m.expectancyR ?? 0) > 0 ? "up" : "down"} hint={`bruta ${r2(res.grossExpectancyR)}`} />
            <Metric k="Profit factor" v={m.profitFactor != null && Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "—"} />
            <Metric k="Acerto (alvo)" v={pc(m.hitRate)} />
            <Metric k="Retorno composto" v={`${res.finalReturnPct >= 0 ? "+" : ""}${res.finalReturnPct.toFixed(1)}%`} tone={res.finalReturnPct >= 0 ? "up" : "down"} hint={`risco de ${res.params.costs.riskPct}% por operação`} />
            <Metric k="Máx. drawdown" v={`-${res.maxDrawdownPct.toFixed(1)}%`} tone="down" />
            <Metric k="Buy & hold" v={res.buyHoldPct != null ? `${res.buyHoldPct >= 0 ? "+" : ""}${res.buyHoldPct.toFixed(1)}%` : "—"} />
            <Metric k="Custos totais" v={`-${res.totalCostR.toFixed(2)}R`} tone="down" hint="taxas + slippage + funding somados, em R" />
          </div>
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-2 text-[13px] font-semibold">Curva de capital (composta) e drawdown</h2>
            <EquityChart data={res} />
          </section>
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-lg border border-border bg-card p-3 text-[12.5px]">
              <h2 className="mb-2 text-[13px] font-semibold">Detalhe</h2>
              {[
                ["Avg R (líquido)", r2(m.avgR)],
                ["Média ganho / perda", `${r2(m.avgWinR)} / ${r2(m.avgLossR)}`],
                ["Hit 1R / 2R / 3R", `${pc(m.hit1R)} / ${pc(m.hit2R)} / ${pc(m.hit3R)}`],
                ["MFE / MAE médios", `${r2(m.avgMfeR)} / ${m.avgMaeR != null ? `-${m.avgMaeR.toFixed(2)}R` : "—"}`],
                ["Máx. drawdown (R)", m.maxDrawdownR != null ? `-${m.maxDrawdownR.toFixed(1)}R` : "—"],
                ["Exposição", `${res.exposurePct.toFixed(0)}% do tempo`],
                ["Bull / Bear / Range", `${r2(res.byRegime.bull.expectancyR)} (${res.byRegime.bull.samples}) / ${r2(res.byRegime.bear.expectancyR)} (${res.byRegime.bear.samples}) / ${r2(res.byRegime.range.expectancyR)} (${res.byRegime.range.samples})`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="tabular text-right">{v}</span>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-muted-foreground">{res.method}</p>
            </section>
            <section className="min-w-0 rounded-lg border border-border bg-card">
              <h2 className="border-b border-border px-3 py-2 text-[13px] font-semibold">Operações ({res.trades.length})</h2>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[720px] whitespace-nowrap text-[12px]">
                  <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">Entrada</th>
                      <th className="px-2 py-1.5">Lado</th>
                      <th className="px-2 py-1.5 text-right">Preço</th>
                      <th className="px-2 py-1.5 text-right">Stop</th>
                      <th className="px-2 py-1.5 text-right">Alvo</th>
                      <th className="px-2 py-1.5 text-right">Saída</th>
                      <th className="px-2 py-1.5">Resultado</th>
                      <th className="px-2 py-1.5 text-right">R bruto</th>
                      <th className="px-2 py-1.5 text-right">R líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...res.trades].reverse().map((t) => (
                      <tr key={t.entryIndex} className="border-t border-border/60">
                        <td className="px-2 py-1">{formatDateTime(t.entryTime)}</td>
                        <td className={cn("px-2 py-1", t.direction === "bullish" ? "text-success" : "text-danger")}>{t.direction === "bullish" ? "Long" : "Short"}</td>
                        <td className="tabular px-2 py-1 text-right">{formatPrice(t.entry)}</td>
                        <td className="tabular px-2 py-1 text-right text-danger">{formatPrice(t.stop)}</td>
                        <td className="tabular px-2 py-1 text-right text-success">{formatPrice(t.target)}</td>
                        <td className="tabular px-2 py-1 text-right">{formatPrice(t.exit)}</td>
                        <td className="px-2 py-1">{t.outcome === "win" ? "alvo" : t.outcome === "loss" ? "stop" : `expirou (${t.bars})`}</td>
                        <td className="tabular px-2 py-1 text-right">{r2(t.rGross)}</td>
                        <td className={cn("tabular px-2 py-1 text-right font-semibold", t.rNet >= 0 ? "text-success" : "text-danger")}>{r2(t.rNet)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {res.trades.length === 0 ? <p className="p-3 text-[12.5px] text-muted-foreground">Nenhuma operação no período com essas regras.</p> : null}
              </div>
            </section>
          </div>
          <p className="text-[11px] text-muted-foreground">Resultado histórico simulado, não é garantia nem promessa de resultado futuro. Não é recomendação de investimento.</p>
        </div>
      ) : null}
    </PageShell>
  );
}

export function BacktestView() {
  return (
    <AccessGate feature="Backtest">
      <BacktestInner />
    </AccessGate>
  );
}
