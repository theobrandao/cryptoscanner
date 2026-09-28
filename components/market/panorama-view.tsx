"use client";

import Link from "next/link";
import useSWR from "swr";
import type { CoinMarket, GlobalData } from "@/services/market/providers/coingecko";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton, Stat } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTickers } from "@/hooks/use-tickers";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatDateTime, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Payload {
  global: (GlobalData & { stale: boolean; source: string }) | null;
  markets: { items: CoinMarket[]; stale: boolean; source: string } | null;
  usdBrl: { rate: number; stale: boolean };
  fearGreed: { value: number; classificationPt: string; timestamp: number; source: string; stale: boolean; history: Array<{ value: number; timestamp: number }> } | null;
}

/** Panorama diário: dados globais (CoinGecko), Medo & Ganância, câmbio e ranking dos 20 ativos. */
export function PanoramaView() {
  const { data, error, isLoading } = useSWR<Payload>("/api/market/global", { refreshInterval: 120_000 });
  const { bySymbol, data: tickers } = useTickers(true);
  const [currency] = useLocalStorage<"USD" | "BRL">("cs-currency", "USD");
  const rate = data?.usdBrl.rate ?? tickers?.usdBrl ?? 1;
  const g = data?.global;
  const fg = data?.fearGreed;
  const list = (data?.markets?.items ?? []).slice().sort((a, b) => b.market_cap - a.market_cap);
  const gainers = [...(tickers?.tickers ?? [])].sort((a, b) => b.changePct24h - a.changePct24h);

  return (
    <PageShell>
      <PageTitle
        icon="🌐"
        title="Panorama Diário"
        description="Visão geral do mercado com fontes públicas: capitalização total e dominância (CoinGecko), índice Medo & Ganância (alternative.me) e os 20 ativos monitorados."
      />
      {error ? <Alert variant="danger">Não foi possível carregar o panorama. Tente novamente em instantes.</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {isLoading && !data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        ) : (
          <>
            <Stat
              label="Cap. total"
              value={g ? formatCompact(g.total_market_cap.usd ?? null) : "—"}
              sub={g ? `${formatPct(g.market_cap_change_percentage_24h_usd)} 24h` : "CoinGecko indisponível"}
              tone={g && g.market_cap_change_percentage_24h_usd < 0 ? "down" : g ? "up" : "muted"}
            />
            <Stat label="Volume 24h" value={g ? formatCompact(g.total_volume.usd ?? null) : "—"} sub={g ? `${g.active_cryptocurrencies.toLocaleString("pt-BR")} criptoativos` : ""} />
            <Stat label="Dominância BTC / ETH" value={g ? `${(g.market_cap_percentage.btc ?? 0).toFixed(1)}% / ${(g.market_cap_percentage.eth ?? 0).toFixed(1)}%` : "—"} />
            <Stat
              label="Medo & Ganância"
              value={fg ? `${fg.value} · ${fg.classificationPt}` : "—"}
              sub={fg ? `${fg.source} · ${formatDateTime(fg.timestamp)}` : "indisponível"}
              tone={fg ? (fg.value >= 60 ? "up" : fg.value <= 40 ? "down" : "muted") : "muted"}
            />
            <Stat label="USD/BRL (USDT)" value={data?.usdBrl.rate ? data.usdBrl.rate.toFixed(3) : "—"} sub={data?.usdBrl.stale ? "defasado" : "CoinGecko"} />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Os 20 ativos monitorados</CardTitle>
            <CardDescription>
              Preço e variação ao vivo ({tickers?.source ?? "…"}); capitalização e ranking via CoinGecko{data?.markets?.stale ? " (defasado)" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">24h</TableHead>
                  <TableHead className="text-right">7d</TableHead>
                  <TableHead className="text-right">Cap. mercado</TableHead>
                  <TableHead className="text-right">Volume 24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.length
                  ? list
                  : ASSETS.map(
                      (a) =>
                        ({
                          id: a.coingeckoId,
                          symbol: a.symbol.toLowerCase(),
                          market_cap: 0,
                          market_cap_rank: 0,
                          total_volume: 0,
                          price_change_percentage_7d_in_currency: undefined,
                        }) as unknown as CoinMarket,
                    )
                ).map((m, idx) => {
                  const asset = ASSETS.find((a) => a.coingeckoId === m.id) ?? ASSETS.find((a) => a.symbol.toLowerCase() === m.symbol);
                  if (!asset) return null;
                  const t = bySymbol.get(asset.symbol);
                  return (
                    <TableRow key={asset.symbol}>
                      <TableCell className="text-muted-foreground">{m.market_cap_rank || idx + 1}</TableCell>
                      <TableCell>
                        <Link href={`/graficos?symbol=${asset.symbol}`} className="hover:underline">
                          <span className="text-muted-foreground">{asset.glyph}</span> <span className="font-semibold">{asset.symbol}</span>{" "}
                          <span className="text-xs text-muted-foreground">{asset.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular">{t ? formatPrice(t.price, currency, rate) : "—"}</TableCell>
                      <TableCell className={cn("text-right tabular", (t?.changePct24h ?? 0) > 0 && "text-success", (t?.changePct24h ?? 0) < 0 && "text-danger")}>
                        {formatPct(t?.changePct24h)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular",
                          (m.price_change_percentage_7d_in_currency ?? 0) > 0 && "text-success",
                          (m.price_change_percentage_7d_in_currency ?? 0) < 0 && "text-danger",
                        )}
                      >
                        {formatPct(m.price_change_percentage_7d_in_currency ?? null)}
                      </TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">{m.market_cap ? formatCompact(m.market_cap) : "—"}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">{t ? formatCompact(t.quoteVolume24h) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Maiores altas 24h</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {gainers.slice(0, 5).map((t) => (
                <Row key={t.symbol} symbol={t.symbol} pct={t.changePct24h} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Maiores baixas 24h</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {gainers
                .slice(-5)
                .reverse()
                .map((t) => (
                  <Row key={t.symbol} symbol={t.symbol} pct={t.changePct24h} />
                ))}
            </CardContent>
          </Card>
          {fg ? (
            <Card>
              <CardHeader>
                <CardTitle>Medo & Ganância — últimos 8 dias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1" style={{ height: 80 }}>
                  {fg.history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <div key={h.timestamp} className="flex flex-1 flex-col items-center gap-1" title={`${h.value} em ${formatDateTime(h.timestamp)}`}>
                        <div className={cn("w-full rounded-t", h.value >= 60 ? "bg-success" : h.value <= 40 ? "bg-danger" : "bg-warning")} style={{ height: `${Math.max(6, h.value * 0.7)}px` }} />
                        <span className="text-[10px] text-muted-foreground">{h.value}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}

function Row({ symbol, pct }: { symbol: string; pct: number }) {
  return (
    <Link href={`/graficos?symbol=${symbol}`} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted">
      <span className="font-semibold">{symbol}</span>
      <span className={cn("tabular", pct > 0 ? "text-success" : pct < 0 ? "text-danger" : "")}>{formatPct(pct)}</span>
    </Link>
  );
}
