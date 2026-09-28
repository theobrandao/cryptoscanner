"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ScannerRow } from "@/agents/scanner-agent";
import type { VolumeAnomaly } from "@/lib/scanner/volume";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Hint } from "@/components/ui/tooltip";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatDateTime, formatPct, formatPrice } from "@/lib/format";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types/market";

/** Mini-gráfico de fechamentos (SVG puro) para os cartões. */
export function Sparkline({ values, tone, className }: { values: number[]; tone: "success" | "danger" | "muted"; className?: string }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "currentColor";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-10 w-full text-muted-foreground", className)} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Classificação do estágio do padrão pela confiança e pelo rompimento descrito na detecção. */
export function patternStatus(p: { confidence: number; summary: string }): { label: string; variant: "success" | "warning" | "muted" } {
  if (/rompid[ao]/i.test(p.summary) || p.confidence >= 80) return { label: "Confirmado", variant: "success" };
  if (p.confidence >= 68) return { label: "Em formação", variant: "warning" };
  return { label: "Alerta inicial", variant: "muted" };
}

/** Estratégia de agente que cobre o padrão detectado (para o atalho “Criar agente”). */
function strategyForPattern(key: string): string {
  if (key === "bull_flag" || key === "bear_flag") return "pattern_breakout";
  if (key === "bear_trap" || key === "bull_trap") return "pattern_breakout";
  if (key === "pivot_bullish" || key === "pivot_bearish") return "pattern_breakout";
  return "pattern_breakout";
}

export function PatternResults({ rows, timeframe, scanned, currency, usdBrl }: { rows: ScannerRow[] | null; timeframe: Timeframe; scanned: boolean; currency: "USD" | "BRL"; usdBrl: number | null }) {
  if (!scanned) {
    return (
      <EmptyState icon="📡" title="Nenhum scan realizado" description="Selecione o timeframe e o tipo de padrão e clique em “Escanear Agora”. Dica: padrões gráficos são mais frequentes em 1D e 7D." />
    );
  }
  const withPatterns = (rows ?? []).filter((r) => r.patterns.length > 0);
  if (withPatterns.length === 0) {
    return (
      <EmptyState
        icon="🧭"
        title="Nenhum padrão gráfico foi detectado nos ativos escaneados neste timeframe"
        description="Tente outro timeframe ou reduza o filtro de direção. A detecção usa pivôs fractais e ATR; padrões abaixo de 60 de confiança são descartados."
      />
    );
  }
  const items = withPatterns.flatMap((r) => r.patterns.map((p) => ({ row: r, p }))).sort((a, b) => b.p.confidence - a.p.confidence);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ row, p }) => {
        const asset = ASSETS.find((a) => a.symbol === row.symbol);
        const rate = usdBrl ?? 1;
        const potential = p.target ? ((p.target - p.price) / p.price) * 100 : null;
        const risk = p.stop ? ((p.price - p.stop) / p.price) * 100 : null;
        const status = patternStatus(p);
        return (
          <Card
            key={`${row.symbol}-${p.key}`}
            className={cn("border-l-4", p.direction === "bullish" ? "border-l-success" : p.direction === "bearish" ? "border-l-danger" : "border-l-muted-foreground")}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{asset?.glyph}</span>
                    <span className="text-lg font-bold">{row.symbol}</span>
                    <Badge variant="muted">{TIMEFRAME_LABEL[timeframe]}</Badge>
                  </div>
                  <div className="mt-1 text-sm font-semibold">{p.label}</div>
                </div>
                <DirectionBadge direction={p.direction} />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Momentum recente:</span>
                <span className={cn("font-semibold", row.momentum.includes("up") ? "text-success" : row.momentum.includes("down") ? "text-danger" : "")}>
                  {row.momentum === "strong_up" ? "▲ forte alta" : row.momentum === "up" ? "▲ alta" : row.momentum === "strong_down" ? "▼ forte baixa" : row.momentum === "down" ? "▼ baixa" : "↔ lateral"}
                </span>
                <span>· tendência {row.trend === "bullish" ? "de alta" : row.trend === "bearish" ? "de baixa" : "neutra"} ({row.trendStrength})</span>
              </div>
              <Sparkline values={row.sparkline ?? []} tone={p.direction === "bullish" ? "success" : p.direction === "bearish" ? "danger" : "muted"} className="mt-2" />
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Confiança (aderência geométrica)</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span className="font-semibold text-foreground tabular">{p.confidence}%</span>
                  </span>
                </div>
                <Progress value={p.confidence} tone={p.confidence >= 75 ? "success" : p.confidence >= 60 ? "primary" : "warning"} className="mt-1" />
              </div>
              {p.context ? <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">⚠️ {p.context.note}</p> : null}
              <p className="mt-3 text-xs text-muted-foreground">{p.summary}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Preço</dt>
                  <dd className="font-semibold tabular">{formatPrice(p.price, currency, rate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Alvo</dt>
                  <dd className="font-semibold tabular text-success">
                    {p.target ? formatPrice(p.target, currency, rate) : "—"}
                    {potential !== null ? <span className="ml-1 text-[10px] text-muted-foreground">{formatPct(potential)}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Stop</dt>
                  <dd className="font-semibold tabular text-danger">
                    {p.stop ? formatPrice(p.stop, currency, rate) : "—"}
                    {risk !== null ? <span className="ml-1 text-[10px] text-muted-foreground">{formatPct(-risk)}</span> : null}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  RSI {Number.isFinite(row.rsi14) ? row.rsi14.toFixed(1) : "—"} · Vol. rel. {Number.isFinite(row.relativeVolume) ? `${row.relativeVolume.toFixed(2)}×` : "—"} ·{" "}
                  {formatDateTime(row.candleTime)}
                </span>
                <span className="flex items-center gap-3">
                  <Link
                    href={`/agentes?novo=1&symbol=${row.symbol}&timeframe=${timeframe}&strategy=${strategyForPattern(p.key)}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    title="Criar agente que monitora este ativo com a estratégia de padrões"
                  >
                    🤖 Criar agente
                  </Link>
                  <Link href={`/graficos?symbol=${row.symbol}&timeframe=${timeframe}&pattern=${p.key}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    📈 Gráfico <ExternalLink className="h-3 w-3" />
                  </Link>
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function VolumeAlerts({ alerts, assets, checkedAt, loading }: { alerts: VolumeAnomaly[] | null; assets: number; checkedAt?: number; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", loading ? "bg-warning live-dot" : "bg-success live-dot")} />
        Monitorando volume em tempo real — candles de 30M e 1H em {assets} ativos; gatilho: aumento de volume ≥ 100% sobre a média das 20 barras anteriores.
        {checkedAt ? <span>· verificado {formatDateTime(checkedAt)}</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">Volumes de candle anômalos costumam ocorrer antes de rompimentos ou em reação a notícias. Confirme sempre com o gráfico.</p>
      {!alerts || alerts.length === 0 ? (
        <EmptyState icon="📊" title="Nenhum volume de candle anômalo detectado" description={`Nenhum dos ${assets} ativos apresentou aumento ≥ 100% sobre a média nos últimos candles de 30M e 1H.`} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {alerts.map((a) => {
            const asset = ASSETS.find((x) => x.symbol === a.symbol);
            return (
              <Card key={`${a.symbol}-${a.timeframe}-${a.candleOpenTime}`}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{asset?.glyph}</span>
                      <span className="font-bold">{a.symbol}</span>
                      <Badge variant="muted">{TIMEFRAME_LABEL[a.timeframe]}</Badge>
                      {a.isCurrentCandle ? (
                        <Hint text="Candle ainda em formação">
                          <Badge variant="warning">aberto</Badge>
                        </Hint>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatCompact(a.volume, "")} vs média {formatCompact(a.averageVolume, "")} · candle {formatDateTime(a.candleOpenTime)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular text-warning">+{a.increasePct.toFixed(0)}%</div>
                    <div className={cn("text-xs tabular", a.direction === "up" && "text-success", a.direction === "down" && "text-danger")}>{formatPct(a.priceChangePct)}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
