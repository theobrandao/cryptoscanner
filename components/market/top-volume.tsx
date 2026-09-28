"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Payload {
  bubbles: Array<{ id: string; symbol: string; name: string; image: string; price: number; rank: number | null; volume24h: number; change: { "24h": number | null } }>;
  usdBrl: number | null;
  stale: boolean;
}

const OURS = new Set(ASSETS.map((a) => a.symbol));

/** Os 20 ativos mais negociados nas últimas 24 h (CoinGecko, sem stablecoins), com preço em USD/BRL. */
export function TopVolume() {
  const [currency, setCurrency] = useLocalStorage<"USD" | "BRL">("cs-currency", "USD");
  const { data, isLoading } = useSWR<Payload>(`/api/market/bubbles?limit=20&currency=${currency}`, { refreshInterval: 60_000 });
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Os 20 ativos mais negociados</CardTitle>
            <CardDescription>Ranking por volume 24 h em todo o mercado (CoinGecko), sem stablecoins e tokens espelho{data?.stale ? " · dados com defasagem" : ""}.</CardDescription>
          </div>
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(["USD", "BRL"] as const).map((c) => (
              <button key={c} onClick={() => setCurrency(c)} className={cn("rounded px-2 py-1 font-semibold cursor-pointer", currency === c ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? <Skeleton className="h-40" /> : null}
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.bubbles ?? []).map((b, i) => {
            const chg = b.change["24h"] ?? 0;
            const href = OURS.has(b.symbol) ? `/graficos?symbol=${b.symbol}` : `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`${b.symbol}USDT`)}`;
            const inner = (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="truncate text-sm font-semibold">{b.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{b.name}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm tabular">{formatPrice(b.price, currency)}</span>
                  <span className={cn("block text-[11px] tabular", chg > 0 ? "text-success" : chg < 0 ? "text-danger" : "text-muted-foreground")}>
                    {formatPct(chg)} · vol {formatCompact(b.volume24h, currency === "BRL" ? "R$" : "$")}
                  </span>
                </span>
              </>
            );
            return (
              <li key={b.id}>
                {OURS.has(b.symbol) ? (
                  <Link href={href} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                    {inner}
                  </Link>
                ) : (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
