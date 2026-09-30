"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PatternStatRow, PatternStatsReport } from "@/services/pattern-stats-service";

const pct = (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`);
const rr = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}R`);
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : !Number.isFinite(v) ? "∞" : v.toFixed(d));
const REGIME_PT: Record<string, string> = { "*": "Todos os regimes", bull: "Tendência de alta", bear: "Tendência de baixa", range: "Lateral" };

/** Cor pela expectativa em R (o que decide se o padrão tem vantagem), não pela taxa de acerto. */
function expTone(v: number | null | undefined, n: number, min: number): string {
  if (v == null || !Number.isFinite(v) || n < min) return "text-muted-foreground";
  return v > 0.05 ? "text-success" : v < -0.05 ? "text-danger" : "text-warning";
}

export function StatsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tf = params.get("timeframe") === "4h" ? "4h" : "1d";
  const symbol = params.get("symbol") ?? "*";
  const regime = params.get("regime") ?? "*";
  const qs = `timeframe=${tf}&symbol=${encodeURIComponent(symbol)}&regime=${regime}`;
  const { data, error, isLoading } = useSWR<PatternStatsReport>(`/api/patterns/stats?${qs}`, { revalidateOnFocus: false });
  const rows = data?.rows ?? [];
  const min = data?.minSample ?? 30;
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(k, v);
    router.replace(`/estatisticas?${p.toString()}`);
  };
  const best = rows.filter((r) => r.samples >= min && r.expectancyR != null).sort((a, b) => (b.expectancyR ?? -99) - (a.expectancyR ?? -99))[0];

  return (
    <PageShell>
      <PageTitle
        icon="🎯"
        title="Backtest dos padrões"
        description="Resultado histórico de cada padrão em R (1R = distância até o stop): acerto, 1R/2R/3R, expectativa, profit factor, drawdown e MAE/MFE — por ativo e por regime."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="Timeframe">
              {(["4h", "1d"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tf === t} onClick={() => set("timeframe", t)} className={cn("min-h-10 min-w-14 rounded px-3 text-sm font-semibold", tf === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <Select value={symbol} onValueChange={(v) => set("symbol", v)}>
              <SelectTrigger className="w-36" aria-label="Ativo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Todos os ativos</SelectItem>
                {(data?.symbols ?? []).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={regime} onValueChange={(v) => set("regime", v)}>
              <SelectTrigger className="w-44" aria-label="Regime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REGIME_PT).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {error ? <Alert variant="danger">Não foi possível carregar o backtest. Tente novamente em instantes.</Alert> : null}
      {isLoading || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Operações no recorte" value={data.totalTrades.toLocaleString("pt-BR")} />
            <Kpi label="Ativos no backtest" value={String(data.assets)} />
            <Kpi label="Período" value={`${new Date(data.fromTime).toLocaleDateString("pt-BR")} – ${new Date(data.toTime).toLocaleDateString("pt-BR")}`} small />
            <Kpi label={`Maior expectativa (n≥${min})`} value={best ? `${best.label} ${rr(best.expectancyR)}` : "nenhum padrão com amostra suficiente"} small />
          </div>
          {rows.length === 0 ? <Alert variant="info">Sem operações neste recorte. Escolha outro ativo, regime ou timeframe.</Alert> : null}

          <div className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <StatCard key={r.key} r={r} min={min} />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="overflow-x-auto p-0 sm:p-0">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Padrão</th>
                    <th className="px-3 py-2 text-right">n</th>
                    <th className="px-3 py-2 text-right">Alvo/Stop/Exp.</th>
                    <th className="px-3 py-2 text-right">Acerto (IC 95%)</th>
                    <th className="px-3 py-2 text-right">1R</th>
                    <th className="px-3 py-2 text-right">2R</th>
                    <th className="px-3 py-2 text-right">3R</th>
                    <th className="px-3 py-2 text-right">Expectativa</th>
                    <th className="px-3 py-2 text-right">Ganho/Perda médios</th>
                    <th className="px-3 py-2 text-right">Fator de lucro</th>
                    <th className="px-3 py-2 text-right">Máx. DD</th>
                    <th className="px-3 py-2 text-right">MFE/MAE</th>
                    <th className="px-3 py-2 text-right">Ao vivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} id={r.key} className="border-b border-border/50 target:bg-primary/10">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 font-medium">
                          {r.label} <DirectionBadge direction={r.direction} />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {r.samples}
                        {r.samples < min ? <Badge variant="warning" className="ml-1">amostra pequena</Badge> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        <span className="text-success">{r.wins}</span>/<span className="text-danger">{r.losses}</span>/<span className="text-muted-foreground">{r.expired}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {pct(r.hitRate)} <span className="text-xs text-muted-foreground">{r.ci ? `(${pct(r.ci.low)}–${pct(r.ci.high)})` : ""}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular">{pct(r.hit1R)}</td>
                      <td className="px-3 py-2 text-right tabular">{pct(r.hit2R)}</td>
                      <td className="px-3 py-2 text-right tabular">{pct(r.hit3R)}</td>
                      <td className={cn("px-3 py-2 text-right font-semibold tabular", expTone(r.expectancyR, r.samples, min))}>{rr(r.expectancyR)}</td>
                      <td className="px-3 py-2 text-right tabular text-xs">
                        {rr(r.avgWinR)} / {rr(r.avgLossR)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">{num(r.profitFactor)}</td>
                      <td className="px-3 py-2 text-right tabular">{r.maxDrawdownR != null ? `${r.maxDrawdownR.toFixed(1)}R` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular text-xs">
                        {num(r.avgMfeR, 1)} / {num(r.avgMaeR, 1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular text-xs">{liveText(r)}</td>
                    </tr>
                  ))}
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
                A coluna que decide é a <strong className="text-foreground">expectativa em R</strong> (resultado médio por operação medido em unidades de risco). Acerto alto com expectativa negativa = alvo curto e stop
                longo. 1R/2R/3R = fração das operações cujo preço andou 1, 2 ou 3 vezes o risco a favor antes do stop. MFE/MAE = excursão máxima a favor/contra, em R. Recortes com menos de {min} operações
                aparecem marcados e não devem ser usados sozinhos.
              </p>
              <p>
                Regime na entrada (só com o passado): alta = preço acima da EMA200 e EMA50 subindo; baixa = abaixo e caindo; lateral = demais casos. A &quot;confiança&quot; exibida no scanner é aderência
                geométrica ao padrão, não probabilidade.
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
        <div className={cn("mt-1 break-words font-bold tabular", small ? "text-sm" : "text-xl")}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatCard({ r, min }: { r: PatternStatRow; min: number }) {
  return (
    <Card id={r.key} className="target:ring-2 target:ring-primary">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{r.label}</span>
          <DirectionBadge direction={r.direction} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Expectativa</div>
            <div className={cn("text-lg font-bold tabular", expTone(r.expectancyR, r.samples, min))}>{rr(r.expectancyR)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Acerto</div>
            <div className="text-lg font-bold tabular">{pct(r.hitRate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fator de lucro</div>
            <div className="text-lg font-bold tabular">{num(r.profitFactor)}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          n={r.samples}
          {r.samples < min ? " (amostra pequena)" : ""} · 1R {pct(r.hit1R)} · 2R {pct(r.hit2R)} · 3R {pct(r.hit3R)} · DD {r.maxDrawdownR != null ? `${r.maxDrawdownR.toFixed(1)}R` : "—"} · IC {r.ci ? `${pct(r.ci.low)}–${pct(r.ci.high)}` : "—"}
        </div>
      </CardContent>
    </Card>
  );
}
