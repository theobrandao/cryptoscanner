"use client";

import Link from "next/link";
import { useTickers } from "@/hooks/use-tickers";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatPct, formatPrice } from "@/lib/format";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Bloco "Os 21 ativos mais negociados" da home: preço (USD/BRL) e variação 24h ao vivo. */
export function HomeMarket() {
  const { data, bySymbol, connected } = useTickers(true);
  const [currency, setCurrency] = useLocalStorage<"USD" | "BRL">("cs-currency", "USD");
  const rate = data?.usdBrl ?? null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Os 21 ativos monitorados</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success live-dot" : "bg-warning")} />
          {data?.source ?? "…"}
          <div className="ml-2 flex rounded-md border border-border p-0.5">
            {(["USD", "BRL"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer", currency === c ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-2">
        {ASSETS.map((a) => {
          const t = bySymbol.get(a.symbol);
          return (
            <li key={a.symbol}>
              <Link href={`/graficos?symbol=${a.symbol}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-center text-muted-foreground">{a.glyph}</span>
                  <span className="font-semibold">{a.symbol}</span>
                </span>
                {t ? (
                  <span className="text-right">
                    <span className="block text-sm tabular">{currency === "BRL" && !rate ? formatPrice(t.price, "USD") : formatPrice(t.price, currency, rate ?? 1)}</span>
                    <span className={cn("block text-[11px] tabular", t.changePct24h > 0 ? "text-success" : t.changePct24h < 0 ? "text-danger" : "text-muted-foreground")}>
                      {t.changePct24h > 0 ? "▲" : t.changePct24h < 0 ? "▼" : "•"} {formatPct(t.changePct24h)} · {formatCompact(t.quoteVolume24h)}
                    </span>
                  </span>
                ) : (
                  <Skeleton className="h-8 w-24" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
