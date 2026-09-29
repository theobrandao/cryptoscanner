"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PatternStatRow, PatternStatsReport } from "@/services/pattern-stats-service";

const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const signed = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

function tone(hr: number | null, n: number): string {
  if (hr == null || n < 10) return "text-muted-foreground";
  return hr >= 0.55 ? "text-success" : hr >= 0.4 ? "text-warning" : "text-danger";
}

export function StatsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tf = params.get("timeframe") === "4h" ? "4h" : "1d";
  const { data, error, isLoading } = useSWR<PatternStatsReport>(`/api/patterns/stats?timeframe=${tf}`, { revalidateOnFocus: false });
  const rows = data?.rows ?? [];
  const best = rows.filter((r) => r.wins + r.losses >= 10 && r.hitRate != null).sort((a, b) => (b.avgReturnPct ?? -99) - (a.avgReturnPct ?? -99))[0];

  return (
    <PageShell>
      <PageTitle
        icon="🎯"
        title="Taxa de acerto dos padrões"
        description="Quanto cada padrão acertou no histórico (backtest) e nos sinais acompanhados ao vivo pelo ciclo automático."
        actions={
          <div className="inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="Timeframe">
            {(["4h", "1d"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tf === t}
                onClick={() => router.replace(`/estatisticas?timeframe=${t}`)}
                className={cn("min-h-10 min-w-16 rounded px-3 text-sm font-semibold", tf === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        }
      />
      {error ? <Alert variant="danger">Falha ao carregar estatísticas: {String((error as Error).message ?? error)}</Alert> : null}
      {isLoading || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Operações testadas" value={data.totalTrades.toLocaleString("pt-BR")} />
            <Kpi label="Ativos" value={String(data.assets)} />
            <Kpi label="Período" value={`${new Date(data.fromTime).toLocaleDateString("pt-BR")} – ${new Date(data.toTime).toLocaleDateString("pt-BR")}`} small />
            <Kpi label="Melhor retorno médio (n≥10)" value={best ? `${best.label} ${signed(best.avgReturnPct)}` : "—"} small />
          </div>

          {/* mobile: cartões */}
          <div className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <StatCard key={r.key} r={r} />
            ))}
          </div>

          {/* desktop: tabela */}
          <Card className="hidden md:block">
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Padrão</th>
                    <th className="px-3 py-2 text-right">Amostras</th>
                    <th className="px-3 py-2 text-right">Alvo / Stop / Expirou</th>
                    <th className="px-3 py-2 text-right">Acerto</th>
                    <th className="px-3 py-2 text-right">IC 95%</th>
                    <th className="px-3 py-2 text-right">Retorno médio</th>
                    <th className="px-3 py-2 text-right">Candles até sair</th>
                    <th className="px-3 py-2 text-right">Ao vivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const n = r.wins + r.losses;
                    return (
                      <tr key={r.key} id={r.key} className="border-b border-border/50 target:bg-primary/10">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2 font-medium">
                            {r.label} <DirectionBadge direction={r.direction} />
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular">{r.samples}</td>
                        <td className="px-3 py-2 text-right tabular">
                          <span className="text-success">{r.wins}</span> / <span className="text-danger">{r.losses}</span> / <span className="text-muted-foreground">{r.expired}</span>
                        </td>
                        <td className={cn("px-3 py-2 text-right font-semibold tabular", tone(r.hitRate, n))}>
                          {pct(r.hitRate)}
                          {n < 10 ? <Badge variant="muted" className="ml-1">n&lt;10</Badge> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular text-muted-foreground">{r.ci ? `${pct(r.ci.low)}–${pct(r.ci.high)}` : "—"}</td>
                        <td className={cn("px-3 py-2 text-right tabular", (r.avgReturnPct ?? 0) >= 0 ? "text-success" : "text-danger")}>{signed(r.avgReturnPct)}</td>
                        <td className="px-3 py-2 text-right tabular text-muted-foreground">{r.avgBars?.toFixed(1) ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular text-xs">{liveText(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como ler</CardTitle>
              <CardDescription>Atualizado em {formatDateTime(data.computedAt)} · recalculado diariamente.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>{data.method}</p>
              <p>
                Acerto alto com retorno médio negativo indica alvo curto e stop longo (ganha pouco, perde muito). O intervalo de confiança mostra a incerteza: com poucas amostras, ele é largo.
                A &quot;confiança&quot; exibida no scanner é aderência geométrica ao padrão, não esta probabilidade.
              </p>
              <p>
                Parâmetros: horizonte {data.params.horizonBars} candles · intervalo mínimo entre registros do mesmo padrão {data.params.cooldownBars} candles · confiança geométrica ≥ {data.params.minConfidence} ·
                janela de detecção {data.params.lookback} candles.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function liveText(r: PatternStatRow): string {
  if (!r.live) return "—";
  const closed = r.live.wins + r.live.losses;
  return `${closed ? `${pct(r.live.hitRate)} (${r.live.wins}/${closed})` : "sem resolvidos"}${r.live.open ? ` · ${r.live.open} aberto(s)` : ""}`;
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("mt-1 font-bold tabular break-words", small ? "text-sm" : "text-xl")}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatCard({ r }: { r: PatternStatRow }) {
  const n = r.wins + r.losses;
  return (
    <Card id={r.key} className="target:ring-2 target:ring-primary">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{r.label}</span>
          <DirectionBadge direction={r.direction} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Acerto</div>
            <div className={cn("text-lg font-bold tabular", tone(r.hitRate, n))}>{pct(r.hitRate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Retorno médio</div>
            <div className={cn("text-lg font-bold tabular", (r.avgReturnPct ?? 0) >= 0 ? "text-success" : "text-danger")}>{signed(r.avgReturnPct)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Alvo/Stop/Exp.</div>
            <div className="font-semibold tabular">
              {r.wins}/{r.losses}/{r.expired}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          IC 95%: {r.ci ? `${pct(r.ci.low)}–${pct(r.ci.high)}` : "—"} · ao vivo: {liveText(r)}
          {n < 10 ? " · amostra pequena" : ""}
        </div>
      </CardContent>
    </Card>
  );
}
