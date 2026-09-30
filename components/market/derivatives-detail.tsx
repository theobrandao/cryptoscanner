"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { AccessGate } from "@/components/account/access-gate";
import { useTheme } from "@/components/providers/theme-provider";
import { Alert } from "@/components/ui/misc";
import { ASSETS } from "@/lib/assets";
import {
  formatCompact,
  formatDateTime,
  formatPct,
  formatPrice,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { isVenue, VENUE_LABEL, VENUES, type Venue } from "@/lib/venues";
import type {
  DerivativesDetail,
  Point,
} from "@/services/derivatives-detail-service";

function MiniChart({
  points,
  kind = "line",
  color = "#2f6bff",
  format,
}: {
  points: Point[];
  kind?: "line" | "histogram";
  color?: string;
  format: (v: number) => string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  React.useEffect(() => {
    const el = ref.current;
    if (!el || points.length < 2) return;
    const dark = theme === "dark";
    const grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    const chart = createChart(el, {
      autoSize: true,
      height: 180,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#8193a8" : "#5b6778",
        fontSize: 10,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, timeVisible: true },
      localization: { locale: "pt-BR", priceFormatter: format },
    });
    let last = 0;
    const data = points.map((p) => {
      const t = Math.max(last + 1, Math.floor(p.time / 1000));
      last = t;
      return { time: t as UTCTimestamp, value: p.value };
    });
    if (kind === "histogram") {
      const s = chart.addSeries(HistogramSeries, { priceLineVisible: false });
      s.setData(
        data.map((d) => ({
          ...d,
          color: d.value >= 0 ? "rgba(22,199,132,0.7)" : "rgba(234,57,67,0.7)",
        })),
      );
    } else {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
      });
      s.setData(data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, kind, color, format, theme]);
  if (points.length < 2)
    return (
      <p className="grid h-[180px] place-items-center text-[12px] text-muted-foreground">
        Série indisponível nesta exchange
      </p>
    );
  return <div ref={ref} className="h-[180px] w-full" />;
}

const fmtPct4 = (v: number) => `${v.toFixed(4)}%`;
const fmtUsd = (v: number) => formatCompact(v);
const fmtPct1 = (v: number) => `${v.toFixed(1)}%`;

function DetailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const symbol = ASSETS.some(
    (a) => a.symbol === params.get("symbol")?.toUpperCase(),
  )
    ? (params.get("symbol") as string).toUpperCase()
    : "BTC";
  const prefer: Venue = isVenue(params.get("exchange"))
    ? (params.get("exchange") as Venue)
    : "binance";
  const { data, error } = useSWR<DerivativesDetail>(
    `/api/markets/${symbol}/derivatives?exchange=${prefer}`,
    { refreshInterval: 60_000 },
  );
  const go = (s: string, v: Venue) =>
    router.replace(`/derivatives?symbol=${s}&exchange=${v}`, { scroll: false });
  const h = data?.history;
  return (
    <section className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Ativo"
          value={symbol}
          onChange={(e) => go(e.target.value, prefer)}
          className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
        >
          {ASSETS.map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.symbol}/USDT perp
            </option>
          ))}
        </select>
        <div
          className="flex rounded-md border border-border p-0.5 text-[12.5px]"
          role="radiogroup"
          aria-label="Exchange do histórico"
        >
          {VENUES.map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={prefer === v}
              onClick={() => go(symbol, v)}
              className={cn(
                "h-8 rounded px-3",
                prefer === v
                  ? "bg-primary/15 font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {VENUE_LABEL[v]}
            </button>
          ))}
        </div>
        <Link
          href={`/charts/${symbol}?exchange=${prefer}&instrument=perp`}
          className="inline-flex min-h-9 items-center text-[12.5px] text-primary hover:underline"
        >
          Abrir na Análise completa →
        </Link>
      </div>
      {error ? (
        <Alert variant="danger">{(error as Error).message}</Alert>
      ) : null}
      {!data && !error ? <div className="skeleton h-64 rounded-lg" /> : null}
      {data ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[820px] whitespace-nowrap text-[12.5px]">
              <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Exchange</th>
                  <th className="px-3 py-2 text-right">Mark</th>
                  <th className="px-3 py-2 text-right">Basis</th>
                  <th className="px-3 py-2 text-right">Funding</th>
                  <th className="px-3 py-2 text-right">Próximo funding</th>
                  <th className="px-3 py-2 text-right">Open interest</th>
                  <th className="px-3 py-2 text-right">OI 24h</th>
                  <th className="px-3 py-2 text-right">Long/Short</th>
                  <th className="px-3 py-2 text-right">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {data.venues.map((v) => (
                  <tr key={v.venue} className="border-t border-border/60">
                    <td className="px-3 py-2 font-semibold">{v.label}</td>
                    {v.ok ? (
                      <>
                        <td className="tabular px-3 py-2 text-right">
                          {v.markPrice != null ? formatPrice(v.markPrice) : "—"}
                        </td>
                        <td className="tabular px-3 py-2 text-right">
                          {v.basisPct != null
                            ? `${v.basisPct >= 0 ? "+" : ""}${v.basisPct.toFixed(3)}%`
                            : "n/d"}
                        </td>
                        <td
                          className={cn(
                            "tabular px-3 py-2 text-right",
                            Math.abs(v.fundingRatePct ?? 0) > 0.05 &&
                              "text-warning",
                          )}
                        >
                          {v.fundingRatePct != null
                            ? `${v.fundingRatePct.toFixed(4)}%`
                            : "—"}
                        </td>
                        <td className="tabular px-3 py-2 text-right">
                          {v.nextFundingTime
                            ? formatDateTime(v.nextFundingTime)
                            : "—"}
                        </td>
                        <td className="tabular px-3 py-2 text-right">
                          {v.openInterestUsd != null
                            ? formatCompact(v.openInterestUsd)
                            : "—"}
                        </td>
                        <td
                          className={cn(
                            "tabular px-3 py-2 text-right",
                            (v.openInterestChange24hPct ?? 0) >= 0
                              ? "text-success"
                              : "text-danger",
                          )}
                        >
                          {v.openInterestChange24hPct != null
                            ? formatPct(v.openInterestChange24hPct, 1)
                            : "—"}
                        </td>
                        <td className="tabular px-3 py-2 text-right">
                          {v.longShortRatio != null
                            ? v.longShortRatio.toFixed(2)
                            : "n/d"}
                        </td>
                        <td className="px-3 py-2 text-right text-[11px] text-muted-foreground">
                          {v.updatedAt ? timeAgo(v.updatedAt) : "—"}
                        </td>
                      </>
                    ) : (
                      <td
                        colSpan={8}
                        className="px-3 py-2 text-[12px] text-warning"
                      >
                        indisponível: {v.error}
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="px-3 py-2">
                    Agregado ({data.aggregated.venues} exchanges)
                  </td>
                  <td colSpan={2} />
                  <td
                    className="tabular px-3 py-2 text-right"
                    title="média ponderada pelo open interest"
                  >
                    {data.aggregated.weightedFundingPct != null
                      ? `${data.aggregated.weightedFundingPct.toFixed(4)}%`
                      : "—"}
                  </td>
                  <td />
                  <td className="tabular px-3 py-2 text-right">
                    {data.aggregated.openInterestUsd != null
                      ? formatCompact(data.aggregated.openInterestUsd)
                      : "—"}
                  </td>
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-[11px] font-normal text-muted-foreground"
                  >
                    AGGREGATED: soma do OI em USD das exchanges que responderam
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                t: "Funding (últimas liquidações)",
                p: h?.funding ?? [],
                kind: "histogram" as const,
                f: fmtPct4,
              },
              {
                t: "Open interest (1h, USD)",
                p: h?.openInterestUsd ?? [],
                kind: "line" as const,
                f: fmtUsd,
              },
              {
                t: "CVD aproximado (taker compra − venda, 1h)",
                p: h?.cvd ?? [],
                kind: "line" as const,
                f: fmtUsd,
                c: "#16c784",
              },
              {
                t: "Taker buy % (1h)",
                p: h?.takerBuyPct ?? [],
                kind: "line" as const,
                f: fmtPct1,
                c: "#f5a524",
              },
            ].map((x) => (
              <div
                key={x.t}
                className="rounded-lg border border-border bg-card p-3"
              >
                <h3 className="mb-1 text-[12.5px] font-semibold">{x.t}</h3>
                <MiniChart
                  points={x.p}
                  kind={x.kind}
                  format={x.f}
                  color={x.c}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Histórico:{" "}
            {h?.venue ? VENUE_LABEL[h.venue] : "nenhuma exchange respondeu"}
            {h?.venue && h.venue !== prefer
              ? ` (${VENUE_LABEL[prefer]} indisponível; usando fonte alternativa)`
              : ""}
            {h?.errors.length ? ` · ${h.errors.join(" · ")}` : ""} · CVD
            calculado a partir do volume taker por hora (não é tick a tick).{" "}
            {data.liquidations.note}
          </p>
        </>
      ) : null}
    </section>
  );
}

export function DerivativesDetailSection() {
  return (
    <AccessGate feature="Derivativos — detalhes">
      <DetailInner />
    </AccessGate>
  );
}
