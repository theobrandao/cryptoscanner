"use client";

import useSWR from "swr";
import Link from "next/link";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Alert, Skeleton } from "@/components/ui/misc";
import { formatCompact, formatPct, formatPrice, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DerivativesDetailSection } from "@/components/market/derivatives-detail";

interface Row {
  symbol: string;
  markPrice: number;
  fundingRate: number;
  openInterestUsd: number | null;
  openInterestChange24hPct: number | null;
  longShortRatio: number | null;
  takerBuySellRatio: number | null;
  updatedAt: number;
}

const SYMBOLS = "BTC,ETH,SOL,BNB,XRP,DOGE,ADA,AVAX,LINK,SUI";

/** Derivativos por ativo (Binance USDⓈ-M público). OI × preço interpretado no terminal de cada ativo. */
export function DerivativesView() {
  const { data, error } = useSWR<{ items: Row[]; errors: Array<{ symbol: string; error: string }>; source: string }>(`/api/market/derivatives?symbols=${SYMBOLS}`, { refreshInterval: 60_000 });
  return (
    <PageShell>
      <PageTitle title="Derivativos" description="Perpétuos USDT: comparativo Binance/Bybit/OKX (OI, funding, basis), histórico de funding, open interest e CVD aproximado. Fonte e horário em cada linha." />
      <DerivativesDetailSection />
      <h2 className="mb-2 text-[15px] font-semibold">Universo · Binance USDⓈ-M</h2>
      {error ? <Alert variant="danger">Derivativos indisponíveis no momento.</Alert> : null}
      {data?.errors.length ? <Alert variant="warning" className="mb-3">{`Sem dados para ${data.errors.map((e) => e.symbol).join(", ")} nesta fonte (${data.errors[0]?.error}). O terminal de cada ativo usa a OKX como alternativa.`}</Alert> : null}
      {!data && !error ? <Skeleton className="h-64" /> : null}
      {data?.items.length ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] whitespace-nowrap text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Ativo</th>
                <th className="px-3 py-2 text-right">Mark</th>
                <th className="px-3 py-2 text-right">Open interest</th>
                <th className="px-3 py-2 text-right">OI 24h</th>
                <th className="px-3 py-2 text-right">Funding</th>
                <th className="px-3 py-2 text-right">Long/Short</th>
                <th className="px-3 py-2 text-right">Taker buy/sell</th>
                <th className="px-3 py-2 text-right">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.symbol} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2 font-semibold">
                    <Link href={`/charts/${r.symbol}`} className="hover:underline">
                      {r.symbol}USDT
                    </Link>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatPrice(r.markPrice)}</td>
                  <td className="tabular px-3 py-2 text-right">{r.openInterestUsd != null ? formatCompact(r.openInterestUsd) : "—"}</td>
                  <td className={cn("tabular px-3 py-2 text-right", (r.openInterestChange24hPct ?? 0) >= 0 ? "text-success" : "text-danger")}>{r.openInterestChange24hPct != null ? formatPct(r.openInterestChange24hPct, 1) : "—"}</td>
                  <td className={cn("tabular px-3 py-2 text-right", r.fundingRate > 0.0005 ? "text-warning" : "")}>{(r.fundingRate * 100).toFixed(4)}%</td>
                  <td className="tabular px-3 py-2 text-right">{r.longShortRatio?.toFixed(2) ?? "—"}</td>
                  <td className="tabular px-3 py-2 text-right">{r.takerBuySellRatio?.toFixed(2) ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{timeAgo(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Fonte: {data.source}. Liquidações agregadas não têm fonte pública gratuita e não são estimadas.</p>
        </div>
      ) : null}
    </PageShell>
  );
}
