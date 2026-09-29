"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { CandlestickChart, type ChartMarker, type ChartSegment, type ChartToggles, type PriceLevel } from "@/components/charts/candlestick-chart";
import { RiskCalculator, type RiskPrefill } from "@/components/risk/risk-calculator";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ASSETS } from "@/lib/assets";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { TIMEFRAME_LABEL, TIMEFRAME_MS as TF_MS } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import type { EngineReport } from "@/services/engine-service";
import type { LiquidityPool } from "@/lib/engines/liquidity";
import type { Timeframe } from "@/types/market";

const TFS: Timeframe[] = ["15m", "30m", "1h", "4h", "1d", "1w"];
const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "muted"> = { LIVE: "success", FALLBACK: "muted", DEGRADED: "warning", DELAYED: "warning", OFFLINE: "danger" };
const DIR_PT: Record<string, string> = { bullish: "alta", bearish: "baixa", neutral: "neutra" };
const LOC_PT: Record<string, string> = { premium: "premium (metade superior)", discount: "desconto (metade inferior)", equilibrium: "equilíbrio" };
const POOL_PT: Record<string, string> = {
  EQH: "Topos iguais (EQH)",
  EQL: "Fundos iguais (EQL)",
  PDH: "Máxima do dia anterior",
  PDL: "Mínima do dia anterior",
  PWH: "Máxima da semana anterior",
  PWL: "Mínima da semana anterior",
  SWING_HIGH: "Topo de swing",
  SWING_LOW: "Fundo de swing",
};
const STATE_PT: Record<string, string> = { available: "disponível", swept: "capturada", broken: "rompida" };

const CHART_TOGGLES: ChartToggles = { ema8: false, ema25: false, ema100: false, ema200: false, bb: false, volume: true, stochRsi: false, macd: false, levels: true, fibonacci: false, trendlines: false };
// semântica de cor: verde alta, vermelho baixa, azul informativo, cinza neutro, amarelo cautela
const C = { up: "#22c55e", down: "#f43f5e", info: "#3b82f6", neutral: "#94a3b8", warn: "#f59e0b" };

const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : formatPrice(v));

export function TerminalView() {
  const params = useSearchParams();
  const router = useRouter();
  const symbol = (params.get("symbol") ?? "BTC").toUpperCase();
  const tfParam = params.get("timeframe") as Timeframe | null;
  const timeframe: Timeframe = tfParam && TFS.includes(tfParam) ? tfParam : "4h";
  const tab = params.get("tab") ?? "overview";
  const { data, error, isLoading } = useSWR<EngineReport>(`/api/engine/${symbol}?timeframe=${timeframe}&candles=1`, { refreshInterval: 60_000 });
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(k, v);
    router.replace(`/terminal?${p.toString()}`);
  };

  return (
    <PageShell>
      <PageTitle
        icon="🖥️"
        title="Terminal"
        description="Contexto → estrutura → liquidez → multi-timeframe → risco. Todos os números vêm de candles fechados; nada é gerado por IA."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={symbol} onValueChange={(v) => set("symbol", v)}>
              <SelectTrigger className="w-40" aria-label="Ativo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.glyph} {a.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex flex-wrap rounded-md border border-border p-0.5" role="tablist" aria-label="Timeframe">
              {TFS.map((t) => (
                <button key={t} role="tab" aria-selected={t === timeframe} onClick={() => set("timeframe", t)} className={cn("min-h-9 rounded px-2.5 text-sm font-semibold", t === timeframe ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {TIMEFRAME_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        }
      />
      {error ? <Alert variant="danger" title="Não foi possível montar a análise">Nenhuma fonte de mercado respondeu para {symbol} {TIMEFRAME_LABEL[timeframe]}. Tente outro timeframe ou aguarde a próxima coleta.</Alert> : null}
      {isLoading && !data ? <Skeleton className="h-[480px]" /> : null}
      {data ? (
        <Tabs value={tab} onValueChange={(v) => set("tab", v)}>
          <TabsList>
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="chart">Gráfico</TabsTrigger>
            <TabsTrigger value="structure">Estrutura</TabsTrigger>
            <TabsTrigger value="liquidity">Liquidez</TabsTrigger>
            <TabsTrigger value="mtf">Multi-TF</TabsTrigger>
            <TabsTrigger value="risk">Risco</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Overview r={data} />
          </TabsContent>
          <TabsContent value="chart">
            <ChartTab r={data} />
          </TabsContent>
          <TabsContent value="structure">
            <StructureTab r={data} />
          </TabsContent>
          <TabsContent value="liquidity">
            <LiquidityTab r={data} />
          </TabsContent>
          <TabsContent value="mtf">
            <MtfTab r={data} />
          </TabsContent>
          <TabsContent value="risk">
            <RiskCalculator key={`${symbol}-${timeframe}`} prefill={riskPrefill(data)} />
          </TabsContent>
        </Tabs>
      ) : null}
    </PageShell>
  );
}

function riskPrefill(r: EngineReport): RiskPrefill {
  const ext = r.structure.external;
  const int = r.structure.internal;
  const side = ext.trend === "bearish" ? "short" : "long";
  const entry = r.price ?? r.lastClosed?.close;
  const invalidation = side === "long" ? ext.lastLow?.price : ext.lastHigh?.price;
  const micro = side === "long" ? int.lastLow?.price : int.lastHigh?.price;
  const target = side === "long" ? r.liquidity.nearestAbove?.price : r.liquidity.nearestBelow?.price;
  const atr = Number.isFinite(ext.atr) ? ext.atr : undefined;
  const stop = invalidation != null && atr != null ? (side === "long" ? invalidation - 0.1 * atr : invalidation + 0.1 * atr) : undefined;
  const validStop = stop != null && entry != null && (side === "long" ? stop < entry : stop > entry) ? Number(stop.toPrecision(8)) : undefined;
  return { side, entry: entry ?? undefined, stop: validStop, target: target ?? undefined, atr, invalidation: invalidation ?? undefined, micro: micro ?? null };
}

function Kv({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "up" | "down" | "warn" }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 p-2.5">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className={cn("break-words text-sm font-semibold tabular", tone === "up" && "text-success", tone === "down" && "text-danger", tone === "warn" && "text-warning")}>{v}</div>
    </div>
  );
}

function Overview({ r }: { r: EngineReport }) {
  const ext = r.structure.external;
  const q = r.quality;
  const toneDir = (d: string) => (d === "bullish" ? "up" : d === "bearish" ? "down" : undefined);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {q ? <Badge variant={STATUS_VARIANT[q.status] ?? "muted"}>{q.status}</Badge> : null}
        <span>
          fonte {q?.source ?? "—"} · último candle {TIMEFRAME_LABEL[r.timeframe]} fechado às {r.lastClosed ? formatDateTime(r.lastClosed.openTime + TF_MS[r.timeframe]) : "—"} (fechamento {px(r.lastClosed?.close)}) · gerado {formatDateTime(r.generatedAt)}
        </span>
        {q?.issues.length ? <span className="text-warning">· {q.issues.join(" · ")}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kv k="Preço (último negócio)" v={px(r.price)} />
        <Kv k="Estrutura externa" v={DIR_PT[ext.trend]} tone={toneDir(ext.trend)} />
        <Kv k="Último evento" v={ext.lastEvent ? `${ext.lastEvent.type} ${DIR_PT[ext.lastEvent.direction]} em ${px(ext.lastEvent.level)}` : "—"} tone={ext.lastEvent ? toneDir(ext.lastEvent.direction) : undefined} />
        <Kv k="Alinhamento HTF" v={`${r.mtf.alignmentScore > 0 ? "+" : ""}${r.mtf.alignmentScore} (${r.mtf.alignment === "aligned_bull" ? "alinhado em alta" : r.mtf.alignment === "aligned_bear" ? "alinhado em baixa" : r.mtf.alignment === "mixed" ? "misto" : "dados insuficientes"})`} tone={r.mtf.alignmentScore >= 60 ? "up" : r.mtf.alignmentScore <= -60 ? "down" : "warn"} />
        <Kv k="Posição na faixa (último fechamento)" v={ext.location ? `${LOC_PT[ext.location]} · ${Math.round((ext.rangePosition ?? 0) * 100)}%` : "—"} />
        <Kv k="Faixa (swing baixo → alto)" v={ext.range ? `${px(ext.range.low)} → ${px(ext.range.high)}` : "—"} />
        <Kv k="Liquidez acima (mais próxima)" v={r.liquidity.nearestAbove ? `${px(r.liquidity.nearestAbove.price)} · ${POOL_PT[r.liquidity.nearestAbove.kind]}` : "—"} />
        <Kv k="Liquidez abaixo (mais próxima)" v={r.liquidity.nearestBelow ? `${px(r.liquidity.nearestBelow.price)} · ${POOL_PT[r.liquidity.nearestBelow.kind]}` : "—"} />
        <Kv k="ATR(14)" v={Number.isFinite(ext.atr) && r.lastClosed ? `${px(ext.atr)} · ${formatNumber((ext.atr / r.lastClosed.close) * 100, 2)}%` : "—"} />
        <Kv k="Sequência de swings" v={ext.sequence || "—"} />
        <Kv k="Capturas recentes" v={r.liquidity.recentSweeps.length ? r.liquidity.recentSweeps.map((s) => `${s.kind} ${px(s.price)} (${s.direction === "bullish" ? "SSL" : "BSL"}, há ${s.barsAgo})`).join(" · ") : "nenhuma"} />
        <Kv k="Multi-timeframe" v={r.mtf.summary || "—"} />
      </div>
      <p className="text-xs text-muted-foreground">
        Leitura técnica determinística, não é recomendação. Setups com entrada, invalidação, alvos, histórico e cenários entram na próxima etapa (confluence engine, com saída NO TRADE).
      </p>
    </div>
  );
}

function chartLayers(r: EngineReport): { levels: PriceLevel[]; markers: ChartMarker[]; segments: ChartSegment[] } {
  const ext = r.structure.external;
  const levels: PriceLevel[] = [];
  for (const p of r.liquidity.pools.filter((x) => x.state === "available").slice(0, 8)) levels.push({ price: p.price, label: p.kind, color: C.info, style: "dashed" });
  if (ext.range) levels.push({ price: ext.range.equilibrium, label: "EQ", color: C.neutral, style: "dotted" });
  const markers: ChartMarker[] = ext.swings.slice(-12).map((s) => ({
    time: s.time,
    position: s.kind === "high" ? "aboveBar" : "belowBar",
    color: s.label === "HH" || s.label === "HL" ? C.up : s.label === "LH" || s.label === "LL" ? C.down : C.neutral,
    shape: "circle",
    text: s.label ?? (s.kind === "high" ? "H" : "L"),
  }));
  const segments: ChartSegment[] = ext.events.slice(-6).map((e) => {
    const sw = ext.swings.find((s) => s.index === e.swingIndex);
    return { from: { time: sw?.time ?? e.time, price: e.level }, to: { time: e.time, price: e.level }, color: e.direction === "bullish" ? C.up : C.down, label: e.type, dashed: e.type === "BOS" };
  });
  return { levels, markers, segments };
}

function ChartTab({ r }: { r: EngineReport }) {
  const layers = React.useMemo(() => chartLayers(r), [r]);
  return (
    <Card>
      <CardContent className="p-2 sm:p-3">
        <CandlestickChart candles={r.candles} series={null} toggles={CHART_TOGGLES} levels={layers.levels} markers={layers.markers} segments={layers.segments} height={480} />
        <p className="mt-2 text-xs text-muted-foreground">
          Marcadores: HH/HL (verde), LH/LL (vermelho) da estrutura externa · linhas: BOS (tracejada) e CHoCH/MSS (contínua) no nível rompido · azul: liquidez disponível · pontilhada: equilíbrio da faixa. Candles fechados.
        </p>
      </CardContent>
    </Card>
  );
}

function StructureTab({ r }: { r: EngineReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(["external", "internal"] as const).map((k) => {
        const s = r.structure[k];
        return (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Estrutura {k === "external" ? "externa" : "interna"} <DirectionBadge direction={s.trend} />
              </CardTitle>
              <CardDescription>
                Pivô de força {s.strength}, amplitude mínima {s.minAtr} ATR · sequência: {s.sequence || "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Eventos (por fechamento)</div>
                {s.events.length ? (
                  <ul className="flex flex-col gap-1">
                    {s.events
                      .slice(-6)
                      .reverse()
                      .map((e) => (
                        <li key={`${e.type}-${e.index}`} className="flex flex-wrap items-center gap-2">
                          <Badge variant={e.direction === "bullish" ? "success" : "danger"}>{e.type}</Badge>
                          <span className="tabular">{px(e.level)}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(e.time)} · deslocamento {formatNumber(e.displacementAtr, 1)} ATR
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Nenhuma quebra de estrutura na janela.</p>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Falhas de rompimento (pavio além, fechamento de volta)</div>
                {s.failed.length ? (
                  <ul className="flex flex-col gap-1">
                    {s.failed
                      .slice(-4)
                      .reverse()
                      .map((f) => (
                        <li key={`${f.type}-${f.index}`} className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">{f.type === "failed_breakout" ? "Falha de rompimento" : "Falha de perda"}</Badge>
                          <span className="tabular">{px(f.level)}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(f.time)} · {formatNumber(f.depthAtr, 2)} ATR além
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Nenhuma.</p>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Últimos swings</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.swings.slice(-8).map((w) => (
                    <span key={`${w.kind}-${w.index}`} className={cn("rounded border px-1.5 py-0.5 text-xs tabular", w.label === "HH" || w.label === "HL" ? "border-success/40 text-success" : w.label ? "border-danger/40 text-danger" : "border-border text-muted-foreground")}>
                      {w.label ?? w.kind} {px(w.price)}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PoolRow({ p }: { p: LiquidityPool }) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-2">{POOL_PT[p.kind]}</td>
      <td className="px-3 py-2">
        <Badge variant={p.side === "BSL" ? "muted" : "muted"}>{p.side}</Badge>
      </td>
      <td className="px-3 py-2 text-right tabular">{px(p.price)}</td>
      <td className="px-3 py-2 text-right tabular">
        {p.distanceAtr > 0 ? "+" : ""}
        {formatNumber(p.distanceAtr, 1)} ATR
      </td>
      <td className="px-3 py-2">
        <Badge variant={p.state === "available" ? "success" : p.state === "swept" ? "warning" : "muted"}>{STATE_PT[p.state]}</Badge>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{p.eventTime ? formatDateTime(p.eventTime) : ""}</td>
    </tr>
  );
}

function LiquidityTab({ r }: { r: EngineReport }) {
  const m = r.liquidity;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kv k="Pools disponíveis acima (BSL)" v={String(m.availableAbove)} />
        <Kv k="Pools disponíveis abaixo (SSL)" v={String(m.availableBelow)} />
        <Kv k="Mais próxima acima" v={m.nearestAbove ? `${px(m.nearestAbove.price)} (${formatNumber(m.nearestAbove.distanceAtr, 1)} ATR)` : "—"} />
        <Kv k="Mais próxima abaixo" v={m.nearestBelow ? `${px(m.nearestBelow.price)} (${formatNumber(m.nearestBelow.distanceAtr, 1)} ATR)` : "—"} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapa de liquidez</CardTitle>
          <CardDescription>Capturada = pavio além e fechamento de volta; rompida = fechamento além. Níveis de dia/semana em UTC. Contexto, não previsão de destino.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nível</th>
                <th className="px-3 py-2">Lado</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="px-3 py-2 text-right">Distância</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Quando</th>
              </tr>
            </thead>
            <tbody>
              {m.pools.slice(0, 20).map((p) => (
                <PoolRow key={`${p.kind}-${p.price}-${p.formedIndex}`} p={p} />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function MtfTab({ r }: { r: EngineReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Matriz multi-timeframe</CardTitle>
        <CardDescription>
          Leitura do maior para o menor. Alinhamento ponderado (1W 30% · 1D 30% · 4H 20% · 1H 12% · 30m/15m 4% cada): {r.mtf.alignmentScore > 0 ? "+" : ""}
          {r.mtf.alignmentScore}.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">TF</th>
              <th className="px-3 py-2">Papel</th>
              <th className="px-3 py-2">Estrutura</th>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">Último evento</th>
              <th className="px-3 py-2 text-right">EMA score</th>
              <th className="px-3 py-2 text-right">RSI</th>
              <th className="px-3 py-2">Posição</th>
              <th className="px-3 py-2 text-right">ATR%</th>
            </tr>
          </thead>
          <tbody>
            {r.mtf.rows.map((row) => (
              <tr key={row.timeframe} className="border-b border-border/50">
                <td className="px-3 py-2 font-semibold">{TIMEFRAME_LABEL[row.timeframe]}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.role}</td>
                <td className="px-3 py-2">
                  <DirectionBadge direction={row.bias} />
                </td>
                <td className="px-3 py-2">{row.phase}</td>
                <td className="px-3 py-2 text-xs">{row.lastEvent ? `${row.lastEvent.type} ${DIR_PT[row.lastEvent.direction]} ${px(row.lastEvent.level)}` : "—"}</td>
                <td className={cn("px-3 py-2 text-right tabular", row.emaScore > 0 ? "text-success" : row.emaScore < 0 ? "text-danger" : "")}>{row.emaScore}</td>
                <td className="px-3 py-2 text-right tabular">{Number.isFinite(row.rsi) ? formatNumber(row.rsi, 1) : "—"}</td>
                <td className="px-3 py-2 text-xs">{row.location ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular">{Number.isFinite(row.atrPct) ? `${formatNumber(row.atrPct, 2)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
