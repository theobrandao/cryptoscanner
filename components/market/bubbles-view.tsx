"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Period = "1h" | "24h" | "7d" | "30d";
const PERIODS: Period[] = ["1h", "24h", "7d", "30d"];

interface ApiBubble {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  marketCap: number;
  rank: number | null;
  volume24h: number;
  change: Record<Period, number | null>;
}

interface Payload {
  bubbles: ApiBubble[];
  count: number;
  stale: boolean;
  fetchedAt: number;
  source: string;
}

interface Bubble {
  symbol: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  change: number;
  price: number;
  volume: number;
  marketCap: number;
  rank: number | null;
}

/** Faixas de cor da legenda (variação %). */
const BUCKETS: Array<{ label: string; test: (c: number) => boolean; rgb: string }> = [
  { label: "> +5%", test: (c) => c > 5, rgb: "22,163,74" },
  { label: "+2% a +5%", test: (c) => c > 2 && c <= 5, rgb: "34,197,94" },
  { label: "0% a +2%", test: (c) => c >= 0 && c <= 2, rgb: "74,222,128" },
  { label: "0% a −2%", test: (c) => c < 0 && c >= -2, rgb: "251,113,133" },
  { label: "−2% a −5%", test: (c) => c < -2 && c >= -5, rgb: "244,63,94" },
  { label: "< −5%", test: (c) => c < -5, rgb: "190,18,60" },
];

function bucketRgb(change: number): string {
  return (BUCKETS.find((b) => b.test(change)) ?? BUCKETS[2]!).rgb;
}

const OUR_SYMBOLS = new Set(ASSETS.map((a) => a.symbol));

/**
 * Mapa de bolhas: 100 maiores ativos por volume (CoinGecko), tamanho ∝ volume 24h (escala log),
 * cor pela variação do período escolhido (1h/24h/7d/30d), simulação física simples em canvas.
 * Implementação própria.
 */
export function BubblesView() {
  const { data, error, isLoading, mutate } = useSWR<Payload>("/api/market/bubbles", { refreshInterval: 60_000 });
  const router = useRouter();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const bubblesRef = React.useRef<Bubble[]>([]);
  const [period, setPeriod] = React.useState<Period>("24h");
  const [sizeBy, setSizeBy] = React.useState<"volume" | "marketCap">("volume");
  const [hover, setHover] = React.useState<Bubble | null>(null);

  // Atualiza dados das bolhas sem reiniciar posições.
  React.useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    const W = canvas?.clientWidth ?? 1000;
    const H = canvas?.clientHeight ?? 640;
    const metric = (b: ApiBubble) => Math.log10(Math.max(sizeBy === "volume" ? b.volume24h : b.marketCap, 1));
    const vals = data.bubbles.map(metric);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const n = Math.max(1, data.bubbles.length);
    // raio base dimensionado para ~100 bolhas caberem na área
    const base = Math.sqrt((W * H) / n) * 0.42;
    const existing = new Map(bubblesRef.current.map((b) => [b.symbol, b]));
    bubblesRef.current = data.bubbles.map((b) => {
      const norm = maxV === minV ? 0.5 : (metric(b) - minV) / (maxV - minV);
      const r = base * (0.45 + norm * 1.35);
      const prev = existing.get(b.symbol);
      return {
        symbol: b.symbol,
        name: b.name,
        x: prev?.x ?? r + Math.random() * Math.max(1, W - 2 * r),
        y: prev?.y ?? r + Math.random() * Math.max(1, H - 2 * r),
        vx: prev?.vx ?? (Math.random() - 0.5) * 0.4,
        vy: prev?.vy ?? (Math.random() - 0.5) * 0.4,
        r,
        change: b.change[period] ?? 0,
        price: b.price,
        volume: b.volume24h,
        marketCap: b.marketCap,
        rank: b.rank,
      };
    });
  }, [data, sizeBy, period]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dark = document.documentElement.classList.contains("dark");
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const bs = bubblesRef.current;
      for (const b of bs) {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x - b.r < 0 || b.x + b.r > W) b.vx *= -1;
        if (b.y - b.r < 0 || b.y + b.r > H) b.vy *= -1;
        b.x = Math.max(b.r, Math.min(W - b.r, b.x));
        b.y = Math.max(b.r, Math.min(H - b.r, b.y));
      }
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!;
          const b = bs[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const min = a.r + b.r + 3;
          if (dist < min) {
            const push = (min - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push * 0.5;
            a.y -= ny * push * 0.5;
            b.x += nx * push * 0.5;
            b.y += ny * push * 0.5;
          }
        }
      }
      for (const b of bs) {
        const rgb = bucketRgb(b.change);
        const intensity = Math.min(1, Math.abs(b.change) / 8);
        const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(${rgb},${0.18 + intensity * 0.35})`);
        grad.addColorStop(1, `rgba(${rgb},${0.06 + intensity * 0.15})`);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = hover?.symbol === b.symbol ? 3 : 1.5;
        ctx.strokeStyle = `rgba(${rgb},${0.55 + intensity * 0.45})`;
        ctx.stroke();
        if (b.r >= 14) {
          ctx.fillStyle = dark ? "#ece9fb" : "#16122b";
          ctx.textAlign = "center";
          ctx.font = `700 ${Math.max(9, Math.min(22, b.r * 0.42))}px ui-sans-serif, system-ui`;
          ctx.fillText(b.symbol, b.x, b.y - (b.r >= 22 ? b.r * 0.05 : -3));
          if (b.r >= 22) {
            ctx.font = `500 ${Math.max(8, Math.min(16, b.r * 0.3))}px ui-sans-serif, system-ui`;
            ctx.fillStyle = b.change >= 0 ? "#22c55e" : "#f43f5e";
            ctx.fillText(`${b.change >= 0 ? "+" : ""}${b.change.toFixed(1)}%`, b.x, b.y + b.r * 0.38);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hover]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return bubblesRef.current.find((b) => Math.hypot(b.x - x, b.y - y) <= b.r) ?? null;
  };

  const open = (b: Bubble) => {
    if (OUR_SYMBOLS.has(b.symbol)) router.push(`/graficos?symbol=${b.symbol}`);
    else window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`${b.symbol}USDT`)}`, "_blank", "noopener");
  };

  const updated = data ? new Date(data.fetchedAt).toLocaleTimeString("pt-BR") : "—";

  return (
    <PageShell>
      <PageTitle
        icon="🫧"
        title="Mapa de Bolhas"
        description="Os 100 maiores ativos por volume 24h (sem stablecoins e tokens espelho) · tamanho = volume (ou capitalização) · cor = variação do período. Clique para abrir o gráfico (ativos do scanner) ou o TradingView."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn("rounded px-2.5 py-1 font-semibold cursor-pointer", period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                  aria-pressed={period === p}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              {(["volume", "marketCap"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSizeBy(k)}
                  className={cn("rounded px-2 py-1 font-semibold cursor-pointer", sizeBy === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  {k === "volume" ? "Tamanho: volume" : "Tamanho: cap."}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              ↻ Atualizar
            </Button>
          </div>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">Variação {period}:</span>
        {BUCKETS.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${b.rgb})` }} />
            {b.label}
          </span>
        ))}
        <span className="ml-auto">
          {data ? `${data.count} ativos · atualizado às ${updated}${data.stale ? " · dados com defasagem" : ""}` : ""}
        </span>
      </div>
      <Card>
        <CardContent className="relative p-0">
          {isLoading && !data ? <Skeleton className="h-[640px] w-full" /> : null}
          {error && !data ? <div className="p-6 text-sm text-danger">Não foi possível carregar o mapa de bolhas (CoinGecko indisponível). Tente novamente em instantes.</div> : null}
          <canvas
            ref={canvasRef}
            className={cn("h-[640px] w-full cursor-pointer rounded-lg", !data && "hidden")}
            onMouseMove={(e) => setHover(pick(e))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const b = pick(e);
              if (b) open(b);
            }}
            aria-label="Mapa de bolhas dos 100 maiores ativos por volume"
          />
          {hover ? (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-card/95 px-3 py-2 text-sm shadow">
              <div className="font-semibold">
                {hover.symbol} · {hover.name} {hover.rank ? <span className="text-muted-foreground">#{hover.rank}</span> : null}
              </div>
              <div className="tabular">
                {formatPrice(hover.price)} · <span className={hover.change >= 0 ? "text-success" : "text-danger"}>{formatPct(hover.change)} ({period})</span>
              </div>
              <div className="tabular text-xs text-muted-foreground">
                vol 24h {formatCompact(hover.volume)} · cap. {formatCompact(hover.marketCap)}
              </div>
              <div className="text-[11px] text-muted-foreground">{OUR_SYMBOLS.has(hover.symbol) ? "Clique para abrir o gráfico" : "Clique para abrir no TradingView"}</div>
            </div>
          ) : null}
          <div className="absolute bottom-3 right-3 text-[11px] text-muted-foreground">fonte: {data?.source ?? "—"}</div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
