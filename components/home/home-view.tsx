"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronDown, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { AccessGate } from "@/components/account/access-gate";
import { Landing, type LandingData } from "@/components/marketing/landing";
import { MarketStrip, MoversCard, NewsCard } from "@/components/market/market-now";
import { Alert } from "@/components/ui/misc";
import { Eyebrow, PillGroup, StatTile, TickerMarquee } from "@/components/ui/showcase";
import { Greeting, MyPanel, QuickActions, useSignalsSeen } from "@/components/home/my-panel";
import { useSession } from "@/hooks/use-session";
import { ASSETS, GLYPH_FONT_CLASS } from "@/lib/assets";
import { formatDateTime, formatPrice, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActiveSignal, SignalsBoard } from "@/services/signals-service";

/** "/" — visitante vê a página de venda; usuário logado vê a tela inicial. */
export function HomeEntry({ landing }: { landing: LandingData }) {
  const { user, loading } = useSession();
  if (loading) return <div className="skeleton m-4 h-64 rounded-lg" aria-busy="true" />;
  if (!user) return <Landing content={landing} />;
  return <HomeView />;
}

const R = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2).replace(".", ",")}R`;

/**
 * Cartão de uma posição aberta pelo modelo. A barra vai do stop inicial ao maior valor entre o preço atual e
 * 1R acima da entrada; marcas: stop móvel (vermelho), entrada (linha) e preço atual (ponto).
 */
function SignalCard({ s }: { s: ActiveSignal }) {
  const asset = ASSETS.find((a) => a.symbol === s.symbol);
  const risk = s.entry - s.initialStop;
  const lo = s.initialStop;
  const hi = Math.max(s.price, s.entry + risk);
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <Link href={`/graficos?symbol=${s.symbol}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-full bg-muted text-[14px] ${GLYPH_FONT_CLASS}`}>{asset?.glyph}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight">{s.symbol}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{asset?.name}</span>
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{s.tf.toUpperCase()}</span>
        {s.isNew ? <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-[10.5px] font-bold text-primary">NOVO</span> : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground">Resultado aberto</div>
          <div className={cn("tabular text-2xl font-extrabold leading-none", s.openR >= 0 ? "text-success" : "text-danger")}>{R(s.openR)}</div>
        </div>
        <div className="text-right text-[11.5px] text-muted-foreground">
          <div className="tabular">{formatPrice(s.price)}</div>
          <div>{s.barsOpen === 0 ? "entrou agora" : `há ${s.barsOpen} candle${s.barsOpen === 1 ? "" : "s"}`}</div>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-danger/40" style={{ width: pos(s.stop) }} />
        <span className="absolute -top-1 h-4 w-px bg-foreground/60" style={{ left: pos(s.entry) }} />
        <span className={cn("absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-card", s.openR >= 0 ? "bg-success" : "bg-danger")} style={{ left: pos(s.price) }} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-[11.5px]">
        <span className="text-muted-foreground">
          Entrada <span className="tabular text-foreground">{formatPrice(s.entry)}</span>
        </span>
        <span className="text-right text-muted-foreground">
          Stop <span className="tabular text-foreground">{formatPrice(s.stop)}</span> ({s.stopDistancePct.toFixed(1)}%)
        </span>
      </div>
    </Link>
  );
}

function Signals() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<SignalsBoard>("/api/signals/breakout", { refreshInterval: 300_000 });
  const [tf, setTf] = React.useState<"all" | "4h" | "1d">("all");
  const [showAll, setShowAll] = React.useState(false);
  const active = data?.active ?? [];
  const rows = active.filter((a) => tf === "all" || a.tf === tf);
  const fresh = active.filter((a) => a.isNew).length;
  const recent = data?.recent ?? [];
  const wins = recent.filter((r) => r.rNet > 0).length;
  const sumR = recent.reduce((s, r) => s + r.rNet, 0);
  const avgOpen = active.length ? active.reduce((s, a) => s + a.openR, 0) / active.length : null;
  const cards = [...rows].sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.entryTime - a.entryTime).slice(0, 8);
  const { attach, mark } = useSignalsSeen();
  return (
    <section id="sinais" ref={attach} onClickCapture={mark} className="flex scroll-mt-20 flex-col gap-4" aria-label="Sinais ativos">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Eyebrow tone="info">Modelo de sinais</Eyebrow>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
            Sinais ativos — rompimento testado
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">Fechamento acima da máxima de 55 candles e da EMA 200. Stop inicial em ATR; depois o stop sobe para a mínima dos últimos 20 candles.</p>
        </div>
        <PillGroup label="Timeframe" value={tf} onChange={setTf} options={[{ value: "all", label: "Todos" }, { value: "4h", label: "4H" }, { value: "1d", label: "1D" }]} />
        <button onClick={() => void mutate()} className="cursor-pointer grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Atualizar sinais">
          <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} />
        </button>
      </div>
      {error ? <Alert variant="danger">Não foi possível calcular os sinais agora. Tente novamente em instantes.</Alert> : null}
      {isLoading ? <div className="skeleton h-48 rounded-2xl" aria-busy="true" /> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile label="Posições abertas" value={active.length} sub={`${fresh} ${fresh === 1 ? "nova" : "novas"} no último candle`} />
            <StatTile label="Resultado aberto médio" value={avgOpen != null ? R(avgOpen) : "—"} tone={avgOpen == null ? undefined : avgOpen >= 0 ? "up" : "down"} sub="sem custos" />
            <StatTile label="Saídas em 30 dias" value={`${wins}/${recent.length}`} sub="com ganho / total" />
            <StatTile label="Soma das saídas" value={recent.length ? R(sumR) : "—"} tone={recent.length ? (sumR >= 0 ? "up" : "down") : undefined} sub="últimos 30 dias, líquido" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((s) => (
              <SignalCard key={`${s.model}:${s.symbol}`} s={s} />
            ))}
            {!cards.length ? <p className="rounded-2xl border border-border bg-card p-4 text-[13px] text-muted-foreground sm:col-span-2 xl:col-span-4">Nenhuma posição aberta pelo modelo neste timeframe.</p> : null}
          </div>
          <div className="rounded-2xl border border-border bg-card">
            <button onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="cursor-pointer flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold">
              Todas as {rows.length} posições em tabela
              <ChevronDown className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")} />
            </button>
            {showAll ? (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[720px] text-[12.5px]">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Ativo</th>
                      <th className="px-2 py-2">TF</th>
                      <th className="px-2 py-2">Entrada (fechamento)</th>
                      <th className="px-2 py-2 text-right">Preço entrada</th>
                      <th className="px-2 py-2 text-right">Preço atual</th>
                      <th className="px-2 py-2 text-right">Resultado aberto</th>
                      <th className="px-2 py-2 text-right">Stop móvel</th>
                      <th className="px-4 py-2 text-right">Distância ao stop</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((a) => (
                      <tr key={`${a.model}:${a.symbol}`} className="hover:bg-muted/40">
                        <td className="px-4 py-1.5 font-semibold">
                          <Link href={`/graficos?symbol=${a.symbol}`} className="hover:text-primary-text">
                            {a.symbol}
                          </Link>
                          {a.isNew ? <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">novo</span> : null}
                        </td>
                        <td className="px-2 py-1.5">{a.tf.toUpperCase()}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{formatDateTime(a.entryTime)}</td>
                        <td className="tabular px-2 py-1.5 text-right">{formatPrice(a.entry)}</td>
                        <td className="tabular px-2 py-1.5 text-right">{formatPrice(a.price)}</td>
                        <td className={cn("tabular px-2 py-1.5 text-right font-semibold", a.openR >= 0 ? "text-success" : "text-danger")}>{R(a.openR)}</td>
                        <td className="tabular px-2 py-1.5 text-right" title={`Stop inicial ${formatPrice(a.initialStop)} · travado ${R(a.lockedR)}`}>
                          {formatPrice(a.stop)}
                        </td>
                        <td className="tabular px-4 py-1.5 text-right text-muted-foreground">{a.stopDistancePct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-2 text-[13px] font-bold">Saídas nos últimos 30 dias</h3>
              <ul className="flex flex-wrap gap-1.5 text-[12px]">
                {recent.map((r) => (
                  <li key={`${r.model}:${r.symbol}:${r.exitTime}`} className="rounded-full border border-border px-2.5 py-0.5" title={`${r.model} · saída ${formatDateTime(r.exitTime)}`}>
                    {r.symbol} {r.tf.toUpperCase()} <span className={cn("tabular font-semibold", r.rNet >= 0 ? "text-success" : "text-danger")}>{R(r.rNet)}</span>
                  </li>
                ))}
                {!recent.length ? <li className="text-muted-foreground">Nenhuma saída nos últimos 30 dias. As operações encerradas pelo modelo aparecem aqui.</li> : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-[12.5px] text-muted-foreground">
              <h3 className="mb-1 text-[13px] font-bold text-foreground">Como ler</h3>
              <p>Acerto histórico de 30 a 40%: a maioria das posições fecha com perda pequena e o resultado vem das poucas que andam muito. Risco sugerido de até 0,5% do capital por posição. Resultado passado não garante resultado futuro.</p>
              {data.models.map((m) => (
                <details key={m.name} className="mt-1.5">
                  <summary className="cursor-pointer text-primary">
                    {m.name}: {m.validation.label.toLowerCase()}
                  </summary>
                  <p className="mt-1">{m.validation.summary}</p>
                  <p className="mt-1 text-warning">{m.validation.caveats}</p>
                </details>
              ))}
              <p className="mt-2 text-[11px]">Calculado {timeAgo(data.generatedAt)} com o mesmo motor do backtest.</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function HomeView() {
  return (
    <div className="flex flex-col">
      <TickerMarquee />
      <PageShell className="flex flex-col gap-8">
        <div className="flex flex-col gap-5">
          <Greeting />
          <MyPanel />
        </div>
        <MarketStrip />
        <AccessGate feature="Sinais do modelo testado">
          <Signals />
        </AccessGate>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <MoversCard />
          <NewsCard />
        </div>
        <QuickActions />
      </PageShell>
    </div>
  );
}
