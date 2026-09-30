"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ChartCandlestick, RefreshCw } from "lucide-react";
import type { IndicatorSnapshot } from "@/lib/indicators/snapshot";
import type { PatternMatch } from "@/lib/patterns/detect";
import type { FibResult } from "@/lib/fibonacci";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AnalysisPanel } from "@/components/charts/analysis-panel";
import {
  CandlestickChart,
  type ChartMarker,
  type ChartSegment,
  type ChartToggles,
  type IndicatorSeries,
  type PriceLevel,
} from "@/components/charts/candlestick-chart";
import { detectTrendLines } from "@/lib/indicators/trendlines";
import { ProviderBanner } from "@/components/scanner/provider-banner";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton, Stat } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS } from "@/lib/assets";
import { ApiClientError } from "@/lib/client-api";
import {
  formatDateTime,
  formatNumber,
  formatPct,
  formatPrice,
  MOMENTUM_LABEL,
} from "@/lib/format";
import { TIMEFRAME_LABEL, parseTimeframe } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import { TIMEFRAMES, type Candle, type Timeframe } from "@/types/market";

interface CandlesPayload {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  source: string;
  stale: boolean;
  fetchedAt: number;
  snapshot: IndicatorSnapshot;
  series: IndicatorSeries;
}

interface ScanPayload {
  rows: Array<{ symbol: string; patterns: PatternMatch[] }>;
}

interface FibPayload {
  result: FibResult | null;
}

const EMPTY_PATTERNS: PatternMatch[] = [];
const DEFAULT_TOGGLES: ChartToggles = {
  ema8: true,
  ema25: true,
  ema100: true,
  ema200: false,
  bb: false,
  volume: true,
  stochRsi: true,
  macd: false,
  levels: true,
  fibonacci: false,
  trendlines: true,
};

export function ChartView() {
  const params = useSearchParams();
  const router = useRouter();
  const symbol = ASSETS.some(
    (a) => a.symbol === (params.get("symbol") ?? "").toUpperCase(),
  )
    ? (params.get("symbol") as string).toUpperCase()
    : "BTC";
  const timeframe = parseTimeframe(params.get("timeframe"), "4h");
  const highlightPattern = params.get("pattern");
  const [toggles, setToggles] = useLocalStorage<ChartToggles>(
    "cs-chart-toggles",
    DEFAULT_TOGGLES,
  );
  const [currency] = useLocalStorage<"USD" | "BRL">("cs-currency", "USD");
  const { bySymbol, data: tickersData } = useTickers(true);
  const live = bySymbol.get(symbol);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CandlesPayload>(
      `/api/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=400&indicators=1`,
      {
        refreshInterval: 60_000,
        keepPreviousData: true,
      },
    );
  const { data: scan } = useSWR<ScanPayload>(
    `/api/scanner/table?timeframe=${timeframe}`,
    { refreshInterval: 60_000 },
  );
  const { data: fib } = useSWR<FibPayload>(
    toggles.fibonacci
      ? `/api/fibonacci?symbol=${symbol}&timeframe=${timeframe}&lookback=80`
      : null,
  );

  // `row.patterns` é uma referência estável do payload SWR; sem useMemo a identidade só muda quando o scan muda.
  const patterns =
    scan?.rows.find((r) => r.symbol === symbol)?.patterns ?? EMPTY_PATTERNS;
  // Seleção manual só vale para o escopo (ativo/timeframe/param) em que foi feita; fora dele volta ao parâmetro da URL.
  const scope = `${symbol}:${timeframe}:${highlightPattern ?? ""}`;
  const [userSelection, setUserSelection] = React.useState<{
    scope: string;
    key: string | null;
  } | null>(null);
  const selectedPattern =
    userSelection?.scope === scope ? userSelection.key : highlightPattern;
  const setSelectedPattern = (key: string | null) =>
    setUserSelection({ scope, key });

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`/graficos?${next.toString()}`);
  };

  const { levels, markers } = React.useMemo(() => {
    const levels: PriceLevel[] = [];
    const markers: ChartMarker[] = [];
    if (!data) return { levels, markers };
    if (toggles.levels) {
      data.snapshot.supports
        .slice(0, 2)
        .forEach((l) =>
          levels.push({
            price: l.price,
            label: `S ${l.touches}×`,
            color: "#22c55e",
            style: "dashed",
          }),
        );
      data.snapshot.resistances
        .slice(0, 2)
        .forEach((l) =>
          levels.push({
            price: l.price,
            label: `R ${l.touches}×`,
            color: "#f43f5e",
            style: "dashed",
          }),
        );
    }
    if (toggles.fibonacci && fib?.result) {
      fib.result.levels
        .filter((l) => l.kind === "retracement" && l.ratio > 0 && l.ratio < 1)
        .forEach((l) =>
          levels.push({
            price: l.price,
            label: `Fib ${(l.ratio * 100).toFixed(1)}%`,
            color: "#a78bfa",
            style: "dotted",
          }),
        );
    }
    const p = patterns.find((x) => x.key === selectedPattern) ?? null;
    if (p) {
      if (p.target)
        levels.push({
          price: p.target,
          label: `Alvo ${p.label}`,
          color: "#22d3ee",
          style: "solid",
        });
      if (p.stop)
        levels.push({
          price: p.stop,
          label: "Stop",
          color: "#f59e0b",
          style: "solid",
        });
      p.levels.forEach((l) =>
        levels.push({
          price: l.price,
          label: l.role,
          color: "#94a3b8",
          style: "dotted",
        }),
      );
      const offset = data.candles.length - Math.min(160, data.candles.length);
      p.points.forEach((pt) => {
        const c = data.candles[offset + pt.index];
        if (c)
          markers.push({
            time: c.openTime,
            position:
              pt.role.toLowerCase().includes("topo") ||
              pt.role.includes("HH") ||
              pt.role.includes("LH") ||
              pt.role.includes("cabeça")
                ? "aboveBar"
                : "belowBar",
            color:
              p.direction === "bullish"
                ? "#22c55e"
                : p.direction === "bearish"
                  ? "#f43f5e"
                  : "#94a3b8",
            shape: "circle",
            text: pt.role,
          });
      });
    }
    return { levels, markers };
  }, [data, toggles, fib, patterns, selectedPattern]);

  const trendLines = React.useMemo(
    () => (data && toggles.trendlines ? detectTrendLines(data.candles) : []),
    [data, toggles.trendlines],
  );
  const segments = React.useMemo<ChartSegment[]>(
    () =>
      trendLines.map((l) => ({
        from: { time: l.from.time, price: l.from.price },
        to: { time: l.to.time, price: l.to.price },
        color: l.kind === "LTA" ? "#22c55e" : "#f43f5e",
        label: `${l.kind}${l.broken ? " rompida" : ""} (${l.touches} toques)`,
        dashed: l.broken,
      })),
    [trendLines],
  );

  const snap = data?.snapshot;
  const rate = tickersData?.usdBrl ?? 1;

  return (
    <PageShell>
      <PageTitle
        icon={<ChartCandlestick className="h-5 w-5" />}
        title="Análise de Gráficos"
        description="Candles em tempo real com indicadores calculados no servidor. Clique num padrão detectado para desenhar pontos, alvo e stop no gráfico."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={symbol} onValueChange={(v) => setParam("symbol", v)}>
          <SelectTrigger className="w-[200px]" aria-label="Ativo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSETS.map((a) => (
              <SelectItem key={a.symbol} value={a.symbol}>
                {a.glyph} {a.symbol} — {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label="Timeframe"
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              role="radio"
              aria-checked={timeframe === tf}
              onClick={() => setParam("timeframe", tf)}
              className={cn(
                "h-9 rounded-md border px-2.5 text-sm font-semibold cursor-pointer",
                timeframe === tf
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {TIMEFRAME_LABEL[tf] === "7D" ? "1W" : TIMEFRAME_LABEL[tf]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          {(
            [
              ["ema8", "EMA 8"],
              ["ema25", "EMA 25"],
              ["ema100", "EMA 100"],
              ["ema200", "EMA 200"],
              ["bb", "BB"],
              ["volume", "Vol"],
              ["stochRsi", "StochRSI"],
              ["macd", "MACD"],
              ["levels", "S/R"],
              ["fibonacci", "Fib"],
              ["trendlines", "LT"],
            ] as Array<[keyof ChartToggles, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setToggles((t) => ({ ...t, [k]: !t[k] }))}
              aria-pressed={toggles[k]}
              className={cn(
                "h-8 rounded-md border px-2 text-xs font-semibold cursor-pointer",
                toggles[k]
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void mutate()}
            loading={isValidating && !isLoading}
            aria-label="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ProviderBanner
        sources={data ? [data.source] : undefined}
        stale={data?.stale}
        onRetry={() => void mutate()}
        loading={isValidating}
      />

      <div className="mt-3 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <Card>
            <CardContent className="p-2 sm:p-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
                <span className="text-xl font-bold">
                  {symbol}
                  <span className="text-sm font-normal text-muted-foreground">
                    /USDT · {TIMEFRAME_LABEL[timeframe]}
                  </span>
                </span>
                {live ? (
                  <>
                    <span className="text-xl font-semibold tabular">
                      {formatPrice(live.price, currency, rate)}
                    </span>
                    <span
                      className={cn(
                        "text-sm tabular",
                        live.changePct24h > 0
                          ? "text-success"
                          : live.changePct24h < 0
                            ? "text-danger"
                            : "",
                      )}
                    >
                      {formatPct(live.changePct24h)} 24h
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      M {formatPrice(live.high24h, currency, rate)} · m{" "}
                      {formatPrice(live.low24h, currency, rate)}
                    </span>
                  </>
                ) : null}
                {data ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {data.candles.length} candles · {data.source} ·{" "}
                    {formatDateTime(data.fetchedAt)}
                  </span>
                ) : null}
              </div>
              {error ? (
                <Alert
                  variant="danger"
                  title="Erro ao carregar dados. Tente novamente em instantes."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void mutate()}
                    >
                      Tentar novamente
                    </Button>
                  }
                >
                  {error instanceof ApiClientError
                    ? error.message
                    : String(error)}
                </Alert>
              ) : isLoading && !data ? (
                <div className="flex h-[520px] items-center justify-center text-sm text-muted-foreground">
                  Carregando dados…
                </div>
              ) : data ? (
                <CandlestickChart
                  candles={data.candles}
                  series={data.series}
                  toggles={toggles}
                  levels={levels}
                  markers={markers}
                  segments={segments}
                  height={520}
                />
              ) : null}
            </CardContent>
          </Card>

          <AnalysisPanel
            key={`${symbol}:${timeframe}`}
            symbol={symbol}
            timeframe={timeframe}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Indicadores ({TIMEFRAME_LABEL[timeframe]})</CardTitle>
            </CardHeader>
            <CardContent>
              {!snap ? (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    label="Tendência"
                    value={<DirectionBadge direction={snap.trend} />}
                    sub={`força ${snap.trendStrength}/100`}
                  />
                  <Stat
                    label="Momentum"
                    value={MOMENTUM_LABEL[snap.momentum]}
                    sub={`ROC10 ${formatPct(snap.roc10)}`}
                  />
                  <Stat
                    label="RSI 14"
                    value={formatNumber(snap.rsi14, 1)}
                    tone={
                      snap.rsi14 >= 70
                        ? "down"
                        : snap.rsi14 <= 30
                          ? "up"
                          : undefined
                    }
                  />
                  <Stat
                    label="StochRSI K/D"
                    value={`${formatNumber(snap.stochRsi.k, 0)} / ${formatNumber(snap.stochRsi.d, 0)}`}
                  />
                  <Stat
                    label="MACD hist."
                    value={formatNumber(snap.macd.histogram, 4)}
                    tone={
                      snap.macd.histogram > 0
                        ? "up"
                        : snap.macd.histogram < 0
                          ? "down"
                          : undefined
                    }
                  />
                  <Stat
                    label="ATR 14"
                    value={`${formatNumber(snap.atrPct, 2)}%`}
                    sub={`σ20 ${formatNumber(snap.volatilityPct, 2)}%`}
                  />
                  <Stat
                    label="Bollinger %B"
                    value={formatNumber(snap.bollinger.percentB, 2)}
                    sub={`largura ${formatNumber(snap.bollinger.bandwidth * 100, 2)}%`}
                  />
                  <Stat
                    label="Vol. relativo"
                    value={`${formatNumber(snap.relativeVolume, 2)}×`}
                    tone={snap.relativeVolume >= 2 ? "up" : undefined}
                  />
                  <Stat
                    label="EMA 8 / 25"
                    value={`${formatNumber(snap.ema8, 2)}`}
                    sub={formatNumber(snap.ema25, 2)}
                  />
                  <Stat
                    label="EMA 100 / 200"
                    value={`${formatNumber(snap.ema100, 2)}`}
                    sub={formatNumber(snap.ema200, 2)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suportes e resistências</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {!snap ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-danger">
                      Resistências
                    </div>
                    {snap.resistances.length ? (
                      snap.resistances.map((l) => (
                        <div
                          key={l.price}
                          className="flex justify-between tabular"
                        >
                          <span>{formatPrice(l.price, currency, rate)}</span>
                          <span className="text-xs text-muted-foreground">
                            {l.touches}× · {(l.strength * 100).toFixed(0)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-success">
                      Suportes
                    </div>
                    {snap.supports.length ? (
                      snap.supports.map((l) => (
                        <div
                          key={l.price}
                          className="flex justify-between tabular"
                        >
                          <span>{formatPrice(l.price, currency, rate)}</span>
                          <span className="text-xs text-muted-foreground">
                            {l.touches}× · {(l.strength * 100).toFixed(0)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Padrões detectados</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {patterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum padrão acima de 60 de confiança em{" "}
                  {TIMEFRAME_LABEL[timeframe]}.
                </p>
              ) : (
                patterns.map((p) => (
                  <button
                    key={p.key}
                    onClick={() =>
                      setSelectedPattern(
                        selectedPattern === p.key ? null : p.key,
                      )
                    }
                    className={cn(
                      "rounded-md border p-2 text-left text-sm transition-colors cursor-pointer",
                      selectedPattern === p.key
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{p.label}</span>
                      <span className="flex items-center gap-1">
                        <DirectionBadge direction={p.direction} />
                        <Badge variant="muted">{p.confidence}</Badge>
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {p.summary}
                    </div>
                    <div className="mt-1 flex gap-3 text-xs tabular">
                      <span className="text-success">
                        Alvo{" "}
                        {p.target ? formatPrice(p.target, currency, rate) : "—"}
                      </span>
                      <span className="text-danger">
                        Stop{" "}
                        {p.stop ? formatPrice(p.stop, currency, rate) : "—"}
                      </span>
                    </div>
                  </button>
                ))
              )}
              <Hint text="Ative “Fib” para desenhar as retrações automáticas do último swing">
                <span className="text-[11px] text-muted-foreground">
                  Clique num padrão para desenhá-lo no gráfico.
                </span>
              </Hint>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
