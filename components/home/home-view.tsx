"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, RefreshCw } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { ToolIconView } from "@/components/layout/tool-icon";
import { AccessGate } from "@/components/account/access-gate";
import { Landing, type LandingData } from "@/components/marketing/landing";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { useTickers } from "@/hooks/use-tickers";
import { formatDateTime, formatPct, formatPrice, timeAgo } from "@/lib/format";
import { MAIN_TOOLS } from "@/lib/tools";
import { cn } from "@/lib/utils";
import type { SignalsBoard } from "@/services/signals-service";

interface GlobalPayload {
  global: { market_cap_percentage: Record<string, number>; market_cap_change_percentage_24h_usd: number } | null;
  fearGreed: { value: number; classificationPt: string } | null;
}

/** "/" — visitante vê a página de venda; usuário logado vê a tela inicial enxuta. */
export function HomeEntry({ landing }: { landing: LandingData }) {
  const { user, loading } = useSession();
  if (loading) return <div className="skeleton m-4 h-64 rounded-lg" aria-busy="true" />;
  if (!user) return <Landing content={landing} />;
  return <HomeView />;
}

function MarketNow() {
  const { bySymbol } = useTickers();
  const { data } = useSWR<GlobalPayload>("/api/market/global", { refreshInterval: 120_000 });
  const card = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="tabular text-lg font-semibold leading-tight">{value}</div>
      {sub ? <div className="tabular text-[12px]">{sub}</div> : null}
    </div>
  );
  const t = (s: string) => bySymbol.get(s);
  const chg = (v: number | undefined) => (v == null ? null : <span className={v >= 0 ? "text-success" : "text-danger"}>{formatPct(v)} 24h</span>);
  const fg = data?.fearGreed;
  const dom = data?.global?.market_cap_percentage?.btc;
  return (
    <section aria-label="Mercado agora" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {card("Bitcoin", t("BTC") ? formatPrice(t("BTC")!.price) : "—", chg(t("BTC")?.changePct24h))}
      {card("Ethereum", t("ETH") ? formatPrice(t("ETH")!.price) : "—", chg(t("ETH")?.changePct24h))}
      {card("Medo & Ganância", fg ? fg.value : "—", fg ? <span className="text-muted-foreground">{fg.classificationPt}</span> : null)}
      {card("Dominância do BTC", dom != null && Number.isFinite(dom) ? `${dom.toFixed(1)}%` : "—", data?.global ? <span className="text-muted-foreground">capitalização {formatPct(data.global.market_cap_change_percentage_24h_usd)} 24h</span> : null)}
    </section>
  );
}

const R = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}R`;

function Signals() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<SignalsBoard>("/api/signals/breakout", { refreshInterval: 300_000 });
  const [tf, setTf] = React.useState<"all" | "4h" | "1d">("all");
  const rows = (data?.active ?? []).filter((a) => tf === "all" || a.tf === tf);
  const fresh = (data?.active ?? []).filter((a) => a.isNew).length;
  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Sinais ativos">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="mr-auto">
          <h2 className="text-[15px] font-semibold">Sinais ativos — rompimento validado</h2>
          <p className="text-[12px] text-muted-foreground">
            Fechamento acima da máxima de 55 candles e da EMA 200. Stop inicial em ATR, depois stop móvel na mínima dos últimos 20 candles.
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5 text-[12px]" role="tablist" aria-label="Timeframe">
          {(["all", "4h", "1d"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tf === k} onClick={() => setTf(k)} className={cn("rounded px-2.5 py-1", tf === k ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {k === "all" ? "Todos" : k.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={() => void mutate()} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground" aria-label="Atualizar sinais">
          <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
        </button>
      </div>
      {error ? (
        <div className="p-3">
          <Alert variant="danger">Não foi possível calcular os sinais agora. Tente novamente em instantes.</Alert>
        </div>
      ) : null}
      {isLoading ? <div className="skeleton m-3 h-40 rounded-md" aria-busy="true" /> : null}
      {data ? (
        <>
          <div className="px-3 pt-2 text-[12px] text-muted-foreground">
            {data.active.length} posições abertas pelo modelo · {fresh} {fresh === 1 ? "nova" : "novas"} no último candle · calculado {timeAgo(data.generatedAt)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-2 py-2">TF</th>
                  <th className="px-2 py-2">Entrada (fechamento)</th>
                  <th className="px-2 py-2 text-right">Preço entrada</th>
                  <th className="px-2 py-2 text-right">Preço atual</th>
                  <th className="px-2 py-2 text-right">Resultado aberto</th>
                  <th className="px-2 py-2 text-right">Stop móvel</th>
                  <th className="px-3 py-2 text-right">Distância ao stop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((a) => (
                  <tr key={`${a.model}:${a.symbol}`} className="hover:bg-muted/50">
                    <td className="px-3 py-1.5 font-semibold">
                      <Link href={`/graficos?symbol=${a.symbol}`} className="hover:text-primary">
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
                    <td className="tabular px-3 py-1.5 text-right text-muted-foreground">{a.stopDistancePct.toFixed(1)}%</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                      Nenhuma posição aberta pelo modelo neste timeframe.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 border-t border-border p-3 lg:grid-cols-[1fr_1fr]">
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">Saídas nos últimos 30 dias</h3>
              <ul className="flex flex-wrap gap-1.5 text-[12px]">
                {data.recent.map((r) => (
                  <li key={`${r.model}:${r.symbol}:${r.exitTime}`} className="rounded border border-border px-2 py-0.5" title={`${r.model} · saída ${formatDateTime(r.exitTime)}`}>
                    {r.symbol} {r.tf.toUpperCase()} <span className={cn("tabular font-semibold", r.rNet >= 0 ? "text-success" : "text-danger")}>{R(r.rNet)}</span>
                  </li>
                ))}
                {data.recent.length === 0 ? <li className="text-muted-foreground">Nenhuma saída no período.</li> : null}
              </ul>
            </div>
            <div className="text-[12px] text-muted-foreground">
              <h3 className="mb-1 text-[13px] font-semibold text-foreground">Como ler</h3>
              <p>
                Acerto histórico de 30 a 40%: a maioria das posições fecha com perda pequena e o resultado vem das poucas que andam muito. Risco sugerido de até 0,5% do capital por posição. Resultado passado não garante resultado futuro.
              </p>
              {data.models.map((m) => (
                <details key={m.name} className="mt-1.5">
                  <summary className="cursor-pointer text-primary">
                    {m.name}: {m.validation.label.toLowerCase()}
                  </summary>
                  <p className="mt-1">{m.validation.summary}</p>
                  <p className="mt-1 text-warning">{m.validation.caveats}</p>
                </details>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ToolsGrid() {
  return (
    <section aria-label="Ferramentas">
      <h2 className="mb-2 text-[15px] font-semibold">Ferramentas</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {MAIN_TOOLS.filter((t) => t.href !== "/").map((t) => (
          <Link key={t.href} href={t.href} className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-3 hover:border-primary/50">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold">
              <ToolIconView icon={t.icon} className="h-4 w-4 text-primary" />
              {t.name}
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="text-[12px] leading-snug text-muted-foreground">{t.purpose}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function HomeView() {
  return (
    <PageShell className="flex flex-col gap-4">
      <PageTitle title="Início" description="Mercado agora, sinais do modelo validado e as ferramentas, cada uma com uma função." />
      <MarketNow />
      <AccessGate feature="Sinais do modelo validado">
        <Signals />
      </AccessGate>
      <ToolsGrid />
    </PageShell>
  );
}
