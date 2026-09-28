"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS } from "@/lib/assets";
import { formatCompact, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Bubble {
  symbol: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  change: number;
  price: number;
  volume: number;
}

/**
 * Mapa de bolhas: tamanho ∝ volume 24h (escala log), cor ∝ variação 24h, simulação física simples em canvas.
 * Implementação própria (a referência tem uma página "Bubbles"; nada de código dela foi usado).
 */
export function BubblesView() {
  const { data, connected } = useTickers(true);
  const router = useRouter();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const bubblesRef = React.useRef<Bubble[]>([]);
  const [sizeBy, setSizeBy] = React.useState<"volume" | "change">("volume");
  const [hover, setHover] = React.useState<Bubble | null>(null);

  // Atualiza dados das bolhas sem reiniciar posições.
  React.useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    const W = canvas?.clientWidth ?? 800;
    const H = canvas?.clientHeight ?? 600;
    const vols = data.tickers.map((t) => Math.log10(Math.max(t.quoteVolume24h, 1)));
    const minV = Math.min(...vols);
    const maxV = Math.max(...vols);
    const maxChange = Math.max(5, ...data.tickers.map((t) => Math.abs(t.changePct24h)));
    const base = Math.min(W, H) / 14;
    const existing = new Map(bubblesRef.current.map((b) => [b.symbol, b]));
    bubblesRef.current = data.tickers.map((t) => {
      const lv = Math.log10(Math.max(t.quoteVolume24h, 1));
      const norm = maxV === minV ? 0.5 : (lv - minV) / (maxV - minV);
      const r = sizeBy === "volume" ? base * (0.55 + norm * 1.1) : base * (0.55 + (Math.abs(t.changePct24h) / maxChange) * 1.1);
      const prev = existing.get(t.symbol);
      return {
        symbol: t.symbol,
        x: prev?.x ?? Math.random() * W,
        y: prev?.y ?? Math.random() * H,
        vx: prev?.vx ?? (Math.random() - 0.5) * 0.6,
        vy: prev?.vy ?? (Math.random() - 0.5) * 0.6,
        r,
        change: t.changePct24h,
        price: t.price,
        volume: t.quoteVolume24h,
      };
    });
  }, [data, sizeBy]);

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
      // física: movimento lento + colisões suaves + paredes
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
          const min = a.r + b.r + 4;
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
        const up = b.change >= 0;
        const intensity = Math.min(1, Math.abs(b.change) / 8);
        const rgb = up ? "34,197,94" : "244,63,94";
        const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(${rgb},${0.15 + intensity * 0.35})`);
        grad.addColorStop(1, `rgba(${rgb},${0.05 + intensity * 0.15})`);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = hover?.symbol === b.symbol ? 3 : 1.5;
        ctx.strokeStyle = `rgba(${rgb},${0.5 + intensity * 0.5})`;
        ctx.stroke();
        ctx.fillStyle = dark ? "#ece9fb" : "#16122b";
        ctx.textAlign = "center";
        ctx.font = `700 ${Math.max(10, b.r * 0.42)}px ui-sans-serif, system-ui`;
        ctx.fillText(b.symbol, b.x, b.y - b.r * 0.05);
        ctx.font = `500 ${Math.max(9, b.r * 0.3)}px ui-sans-serif, system-ui`;
        ctx.fillStyle = up ? "#22c55e" : "#f43f5e";
        ctx.fillText(`${b.change >= 0 ? "+" : ""}${b.change.toFixed(1)}%`, b.x, b.y + b.r * 0.35);
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

  return (
    <PageShell>
      <PageTitle
        icon="🫧"
        title="Bubbles"
        description="Cada bolha é um dos 20 ativos: tamanho proporcional ao volume 24h (ou à variação) e cor pela variação de 24h. Clique para abrir o gráfico."
        actions={
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(["volume", "change"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSizeBy(k)}
                className={cn("rounded px-2 py-1 font-semibold cursor-pointer", sizeBy === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {k === "volume" ? "Tamanho: volume" : "Tamanho: variação"}
              </button>
            ))}
          </div>
        }
      />
      <Card>
        <CardContent className="relative p-0">
          {!data ? <Skeleton className="h-[600px] w-full" /> : null}
          <canvas
            ref={canvasRef}
            className={cn("h-[600px] w-full cursor-pointer rounded-lg", !data && "hidden")}
            onMouseMove={(e) => setHover(pick(e))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const b = pick(e);
              if (b) router.push(`/graficos?symbol=${b.symbol}`);
            }}
            aria-label="Mapa de bolhas dos ativos"
          />
          {hover ? (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-card/95 px-3 py-2 text-sm shadow">
              <div className="font-semibold">
                {hover.symbol} · {ASSETS.find((a) => a.symbol === hover.symbol)?.name}
              </div>
              <div className="tabular">
                {formatPrice(hover.price)} · <span className={hover.change >= 0 ? "text-success" : "text-danger"}>{formatPct(hover.change)}</span> · vol {formatCompact(hover.volume)}
              </div>
            </div>
          ) : null}
          <div className="absolute bottom-3 right-3 text-[11px] text-muted-foreground">
            {connected ? "AO VIVO" : "polling"} · {data?.source}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
