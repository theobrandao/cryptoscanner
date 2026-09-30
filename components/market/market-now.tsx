"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { StatTile } from "@/components/ui/showcase";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS, GLYPH_FONT_CLASS } from "@/lib/assets";
import { formatCompact, formatPrice, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Change } from "@/components/market/change";

interface GlobalPayload {
  global: { total_market_cap: Record<string, number>; total_volume: Record<string, number>; market_cap_percentage: Record<string, number>; market_cap_change_percentage_24h_usd: number } | null;
  markets: { items: Array<{ symbol: string; image?: string; price_change_percentage_7d_in_currency?: number | null }> } | null;
  fearGreed: { value: number; classificationPt: string } | null;
}

interface PanoramaNews {
  news: { positive: number; negative: number; neutral: number; top: Array<{ title: string; source: string; link: string; publishedAt: number }> } | null;
}

/** Faixa de métricas do mercado (capitalização, volume, dominância, sentimento). */
export function MarketStrip() {
  const { data } = useSWR<GlobalPayload>("/api/market/global", { refreshInterval: 120_000 });
  const g = data?.global;
  const fg = data?.fearGreed;
  const chg = g?.market_cap_change_percentage_24h_usd;
  const btcDom = g?.market_cap_percentage.btc;
  const ethDom = g?.market_cap_percentage.eth;
  return (
    <section aria-label="Métricas do mercado" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <StatTile label="Capitalização total" value={g ? formatCompact(g.total_market_cap.usd) : "—"} sub={chg != null ? <Change value={chg} suffix=" em 24h" /> : "\u00a0"} />
      <StatTile label="Volume 24h" value={g ? formatCompact(g.total_volume.usd) : "—"} sub="todas as corretoras" />
      <StatTile label="Dominância" value={btcDom != null ? `${btcDom.toFixed(1)}%` : "—"} sub={ethDom != null ? `BTC · ETH ${ethDom.toFixed(1)}%` : "\u00a0"} />
      <StatTile label="Medo & Ganância" value={fg ? fg.value : "—"} sub={fg?.classificationPt ?? "\u00a0"} tone={fg ? (fg.value >= 55 ? "up" : fg.value <= 45 ? "down" : undefined) : undefined} />
    </section>
  );
}

type MoversTab = "top" | "gainers" | "losers" | "volume";
const TABS: Array<{ key: MoversTab; label: string }> = [
  { key: "top", label: "Principais" },
  { key: "gainers", label: "Maiores altas" },
  { key: "losers", label: "Maiores baixas" },
  { key: "volume", label: "Mais negociadas" },
];

/** Mercado agora: 30 ativos monitorados em abas, preço ao vivo, variação 24h e 7 dias, volume. */
export function MoversCard({ limit = 8 }: { limit?: number }) {
  const { data } = useTickers();
  const { data: g } = useSWR<GlobalPayload>("/api/market/global", { refreshInterval: 300_000 });
  const [tab, setTab] = React.useState<MoversTab>("top");
  const meta = new Map((g?.markets?.items ?? []).map((m) => [m.symbol.toUpperCase(), m]));
  const all = (data?.tickers ?? []).filter((t) => ASSETS.some((a) => a.symbol === t.symbol));
  const order = new Map(ASSETS.map((a) => [a.symbol, a.sortOrder]));
  const rows = [...all]
    .sort((a, b) =>
      tab === "gainers" ? b.changePct24h - a.changePct24h : tab === "losers" ? a.changePct24h - b.changePct24h : tab === "volume" ? b.quoteVolume24h - a.quoteVolume24h : (order.get(a.symbol) ?? 99) - (order.get(b.symbol) ?? 99),
    )
    .slice(0, limit);
  return (
    <section className="rounded-2xl border border-border bg-card" aria-label="Mercado agora">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-bold">Mercado agora</h3>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Lista">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px]", tab === t.key ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_64px_64px] gap-2 border-b border-border px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_72px_minmax(0,0.9fr)]">
        <span>Ativo</span>
        <span className="text-right">Preço</span>
        <span className="text-right">24h</span>
        <span className="text-right">7 dias</span>
        <span className="hidden text-right sm:block">Volume 24h</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((t) => {
          const a = ASSETS.find((x) => x.symbol === t.symbol);
          const m = meta.get(t.symbol);
          const d7 = m?.price_change_percentage_7d_in_currency;
          return (
            <li key={t.symbol}>
              <Link href={`/graficos?symbol=${t.symbol}`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_64px_64px] items-center gap-2 px-4 py-2 text-[13px] hover:bg-muted/40 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_72px_minmax(0,0.9fr)]">
                <span className="flex min-w-0 items-center gap-2">
                  {m?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0 rounded-full" loading="lazy" />
                  ) : (
                    <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-muted text-[11px] ${GLYPH_FONT_CLASS}`}>{a?.glyph}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold leading-tight">{t.symbol}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{a?.name}</span>
                  </span>
                </span>
                <span className="tabular text-right">{formatPrice(t.price)}</span>
                <Change value={t.changePct24h} className="text-right font-semibold" />
                <span className="text-right text-[12px]" title="7 dias">
                  <Change value={d7} decimals={1} />
                </span>
                <span className="tabular hidden text-right text-[12px] text-muted-foreground sm:block">{formatCompact(t.quoteVolume24h)}</span>
              </Link>
            </li>
          );
        })}
        {!rows.length ? <li className="skeleton m-3 rounded-md" style={{ height: limit * 47 - 24 }} aria-busy="true" /> : null}
      </ul>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground">
        <span>Preços ao vivo · volume em USDT</span>
        <Link href="/panorama" className="inline-flex min-h-9 items-center font-semibold text-primary hover:underline">
          Ver os 30 ativos
        </Link>
      </div>
    </section>
  );
}

/** Manchetes recentes (feeds públicos), com fonte e horário. */
export function NewsCard({ limit = 6 }: { limit?: number }) {
  const { data } = useSWR<PanoramaNews>("/api/market/panorama", { refreshInterval: 600_000 });
  const n = data?.news;
  const total = n ? n.positive + n.negative + n.neutral : 0;
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card" aria-label="Notícias">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-bold">Notícias</h3>
        {n && total ? (
          <span className="text-[11.5px] text-muted-foreground" title="classificação das manchetes das últimas 24h">
            <span className="text-success">{n.positive} positivas</span> · <span className="text-danger">{n.negative} negativas</span> · {n.neutral} neutras
          </span>
        ) : null}
      </div>
      <ul className="flex-1 divide-y divide-border">
        {(n?.top ?? []).slice(0, limit).map((a) => (
          <li key={a.title} className="px-4 py-2.5">
            {a.link ? (
              <a href={a.link} target="_blank" rel="noopener noreferrer" className="group text-[13px] font-medium leading-snug hover:text-primary-text">
                {a.title} <ExternalLink className="inline h-3 w-3 opacity-50 group-hover:opacity-100" />
              </a>
            ) : (
              <span className="text-[13px] font-medium leading-snug">{a.title}</span>
            )}
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {a.source} · {timeAgo(a.publishedAt)}
            </div>
          </li>
        ))}
        {!n ? <li className="skeleton m-3 rounded-md" style={{ height: limit * 62 - 24 }} aria-busy="true" /> : null}
      </ul>
      <div className="border-t border-border px-4 py-2 text-right text-[11.5px]">
        <Link href="/panorama" className="inline-flex min-h-9 items-center font-semibold text-primary hover:underline">
          Panorama do dia
        </Link>
      </div>
    </section>
  );
}
