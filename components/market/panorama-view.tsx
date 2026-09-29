"use client";

import Link from "next/link";
import useSWR from "swr";
import type { CoinMarket, GlobalData } from "@/services/market/providers/coingecko";
import type { PanoramaReport } from "@/services/panorama-service";
import type { WhaleSnapshot } from "@/services/onchain/whales";
import { Badge } from "@/components/ui/badge";
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

/** Panorama diário: dados globais (CoinGecko), Medo & Ganância, câmbio e ranking dos 30 ativos. */
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
        description="Visão geral do mercado com fontes públicas: capitalização total e dominância (CoinGecko), índice Medo & Ganância (alternative.me) e os 30 ativos monitorados."
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

      <ExecutiveReport />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Os 30 ativos monitorados</CardTitle>
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

const BIAS_LABEL = { bullish: "Alta", bearish: "Baixa", neutral: "Neutro" } as const;
const BIAS_VARIANT = { bullish: "success", bearish: "danger", neutral: "muted" } as const;

/** Resumo executivo determinístico + fatores + ciclo + derivativos + manchetes (GET /api/market/panorama). */
function ExecutiveReport() {
  const { data, error, isLoading } = useSWR<PanoramaReport & { stale: boolean }>("/api/market/panorama", { refreshInterval: 300_000 });
  if (error) return <Alert variant="danger" className="mt-4">Relatório executivo indisponível no momento.</Alert>;
  if (isLoading && !data) return <Skeleton className="mt-4 h-48" />;
  if (!data) return null;
  const d = data;
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>⚡ Resumo executivo do dia</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={BIAS_VARIANT[d.bias]}>viés: {BIAS_LABEL[d.bias]}</Badge>
                <span>gerado {formatDateTime(d.generatedAt)}{d.stale ? " · cache" : ""}</span>
              </div>
            </div>
            <CardDescription>
              Síntese por regras sobre dados públicos (sem modelo de linguagem): cada frase deriva de um número abaixo. Ciclo inferido: <span className="font-semibold text-foreground">{d.cycle.label}</span> — {d.cycle.detail}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm leading-relaxed">
            {d.summary.map((line, i) => (
              <p key={i} className={cn(i === d.summary.length - 1 && "text-xs text-muted-foreground")}>
                {line}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>📌 Principais fatores</CardTitle>
            <CardDescription>Rótulo de viés por fator, com a fonte do dado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {d.factors.map((f) => (
              <div key={f.title} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{f.title}</div>
                  <Badge variant={BIAS_VARIANT[f.bias]}>{BIAS_LABEL[f.bias]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">fonte: {f.source}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        {d.news ? (
          <Card>
            <CardHeader>
              <CardTitle>📰 Manchetes</CardTitle>
              <CardDescription>
                {d.news.positive} positivas · {d.news.negative} negativas · {d.news.neutral} neutras (léxico determinístico; sinal fraco).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {d.news.top.map((n) => (
                <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-between gap-3 rounded px-2 py-1 hover:bg-muted">
                  <span className="min-w-0 truncate">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {n.source} · {n.score === null ? "—" : n.score > 0.1 ? "▲" : n.score < -0.1 ? "▼" : "•"}
                  </span>
                </a>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>🧮 Derivativos (Binance Futures)</CardTitle>
            <CardDescription>Funding, open interest, contas long/short e agressão taker (1 h). Dados públicos, sem chave.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {d.derivatives.items.length === 0 ? (
              <Alert variant="warning">Derivativos indisponíveis: {d.derivatives.error ?? "sem resposta"}.</Alert>
            ) : (
              d.derivatives.items.map((x) => {
                const fr = x.fundingRate * 100;
                return (
                  <div key={x.symbol} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{x.symbol}USDT perp.</span>
                      <span className="tabular text-xs text-muted-foreground">mark {formatPrice(x.markPrice)}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Funding</dt>
                      <dd className={cn("tabular text-right", fr > 0.03 ? "text-danger" : fr < 0 ? "text-success" : "")}>{fr.toFixed(4)}%</dd>
                      <dt className="text-muted-foreground">Open interest</dt>
                      <dd className="tabular text-right">
                        {x.openInterestUsd ? formatCompact(x.openInterestUsd) : `${x.openInterest.toFixed(0)} ${x.symbol}`}
                        {x.openInterestChange24hPct !== null ? <span className={cn("ml-1", x.openInterestChange24hPct >= 0 ? "text-success" : "text-danger")}>{formatPct(x.openInterestChange24hPct)}</span> : null}
                      </dd>
                      <dt className="text-muted-foreground">Contas long</dt>
                      <dd className="tabular text-right">{x.longAccountPct !== null ? `${x.longAccountPct.toFixed(1)}% (L/S ${x.longShortRatio?.toFixed(2)})` : "—"}</dd>
                      <dt className="text-muted-foreground">Taker compra/venda</dt>
                      <dd className={cn("tabular text-right", (x.takerBuySellRatio ?? 1) > 1.05 ? "text-success" : (x.takerBuySellRatio ?? 1) < 0.95 ? "text-danger" : "")}>{x.takerBuySellRatio?.toFixed(2) ?? "—"}</dd>
                    </dl>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        <WhalesCard />
        {d.notAvailable.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Fora do escopo desta implementação</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
              {d.notAvailable.map((n) => (
                <p key={n}>• {n}</p>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

const KIND_LABEL = { consolidacao: "Consolidação (muitas entradas → 1 saída)", distribuicao: "Distribuição (1 entrada → muitas saídas)", transferencia: "Transferência" } as const;

/** Grandes transações on-chain (≥ 50 BTC) coletadas pelo cron dos blocos mais recentes. */
function WhalesCard() {
  const { data } = useSWR<{ snapshot: WhaleSnapshot | null; available: boolean; note: string }>("/api/market/whales", { refreshInterval: 120_000 });
  const snap = data?.snapshot ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>🐋 Grandes transações on-chain (BTC)</CardTitle>
        <CardDescription>
          {snap ? `≥ ${snap.thresholdBtc} BTC · ${snap.count24h} tx em 24 h · ${formatCompact(snap.totalBtc24h, "")} BTC · último bloco ${snap.lastBlock?.height ?? "—"} (${snap.lastBlock ? formatDateTime(snap.lastBlock.time) : "—"})` : "Aguardando a primeira coleta do cron (a cada 10 min)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-h-80 flex-col gap-1 overflow-auto text-sm">
        {snap?.items.slice(0, 25).map((t) => (
          <a key={t.hash} href={`https://mempool.space/tx/${t.hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted">
            <span className="min-w-0">
              <span className="font-mono text-xs text-muted-foreground">{t.hash.slice(0, 8)}…{t.hash.slice(-6)}</span>
              <span className="ml-2 text-xs">{KIND_LABEL[t.kind]}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular">{t.btc.toLocaleString("pt-BR")} BTC</span>
              <span className="block text-[11px] text-muted-foreground">{t.usd ? formatCompact(t.usd) : ""} · {formatDateTime(t.time)}</span>
            </span>
          </a>
        ))}
        {snap && snap.items.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma transação ≥ {snap.thresholdBtc} BTC nos blocos processados nas últimas 24 h.</p> : null}
        <p className="mt-1 text-[11px] text-muted-foreground">{data?.note ?? ""}</p>
      </CardContent>
    </Card>
  );
}

function Row({ symbol, pct }: { symbol: string; pct: number }) {
  return (
    <Link href={`/graficos?symbol=${symbol}`} className="flex min-h-9 items-center justify-between rounded px-2 py-1 hover:bg-muted">
      <span className="font-semibold">{symbol}</span>
      <span className={cn("tabular", pct > 0 ? "text-success" : pct < 0 ? "text-danger" : "")}>{formatPct(pct)}</span>
    </Link>
  );
}
