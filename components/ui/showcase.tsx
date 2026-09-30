"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolIconView } from "@/components/layout/tool-icon";
import { useSession } from "@/hooks/use-session";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS, GLYPH_FONT_CLASS } from "@/lib/assets";
import { formatPct, formatPrice } from "@/lib/format";
import type { Tool } from "@/lib/tools";
import { prefetchFor } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Blocos de apresentação: seções com selo e título de destaque, cartões de ferramenta com ícone,
 * selos e marcadores, pílulas de seleção, números em destaque, faixa de cotações e gráficos simples.
 */

export function Eyebrow({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "info" | "warning" | "success" }) {
  const tones = { primary: "border-primary/40 bg-primary/10 text-primary-text", info: "border-info/40 bg-info/10 text-info-text", warning: "border-warning/40 bg-warning/10 text-warning", success: "border-success/40 bg-success/10 text-success" };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", tones[tone])}>{children}</span>;
}

export function SectionHeading({ eyebrow, title, accent, subtitle, align = "center", tone }: { eyebrow?: string; title: string; accent?: string; subtitle?: React.ReactNode; align?: "center" | "left"; tone?: "primary" | "info" | "warning" | "success" }) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" ? "items-center text-center" : "items-start")}>
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2 className="text-balance text-2xl font-bold leading-tight tracking-[-0.025em] sm:text-4xl">
        {title} {accent ? <span className="text-gradient">{accent}</span> : null}
      </h2>
      {subtitle ? <p className={cn("max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground", align === "center" && "mx-auto")}>{subtitle}</p> : null}
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">{children}</span>;
}

/** Cartão de ferramenta: ícone em bloco colorido, selo, função em uma frase, marcadores e link. */
export function ToolCard({ tool, href, cta = "Abrir", compact, showCategory }: { tool: Tool; href?: string; cta?: string; compact?: boolean; showCategory?: boolean }) {
  const { user } = useSession();
  const target = href ?? tool.href;
  return (
    <Link href={target} prefetch={prefetchFor(target, !!user)} className="card-glow group flex h-full flex-col gap-3 rounded-lg border border-border p-4 transition-[border-color,transform] duration-200 ease-standard hover:-translate-y-px hover:border-border-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className={cn("icon-tile grid shrink-0 place-items-center rounded-xl", compact ? "h-9 w-9" : "h-11 w-11")}>
          <ToolIconView icon={tool.icon} className={compact ? "h-4.5 w-4.5" : "h-5 w-5"} />
        </span>
        {tool.badge ? <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[10.5px] font-semibold text-info-text">{tool.badge}</span> : null}
      </div>
      <div>
        {showCategory ? <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-primary">{tool.category}</div> : null}
        <h3 className={cn("font-bold tracking-tight", compact ? "text-[15px]" : "text-[17px]")}>{tool.name}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{tool.purpose}</p>
      </div>
      {!compact && tool.chips?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tool.chips.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      ) : null}
      <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
        {cta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Número em destaque com rótulo. */
export function StatTile({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" | "accent"; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-4 py-3", className)}>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-1 text-2xl font-bold leading-tight tracking-[-0.025em]", tone === "up" && "text-success", tone === "down" && "text-danger", tone === "accent" && "text-primary-text")}>{value}</div>
      {sub ? <div className="tabular mt-0.5 text-[12px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Grupo de pílulas (seleção única). */
export function PillGroup<T extends string | number>({ options, value, onChange, label, className }: { options: Array<{ value: T; label: React.ReactNode }>; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors", value === o.value ? "border-primary bg-primary/15 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Linha simples em SVG (sparkline ou curva), escala automática. */
export function LineChart({ values, compare, height = 120, className, tone, area = true, label }: { values: number[]; /** segunda série tracejada na mesma escala (ex.: total aportado) */ compare?: number[]; height?: number; className?: string; tone?: "up" | "down" | "primary"; area?: boolean; label?: string }) {
  const id = React.useId().replace(/:/g, "");
  if (values.length < 2) return <div className={cn("grid place-items-center text-[12px] text-muted-foreground", className)} style={{ height }}>sem dados</div>;
  const w = 600;
  const all = compare?.length ? [...values, ...compare] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${((i / (vs.length - 1)) * w).toFixed(1)},${(height - 4 - ((v - min) / span) * (height - 8)).toFixed(1)}`).join(" ");
  const d = path(values);
  const color = tone === "down" ? "var(--danger)" : tone === "up" ? "var(--success)" : "var(--primary)";
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height }} role="img" aria-label={label ?? "gráfico"}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area ? <path d={`${d} L${w},${height} L0,${height} Z`} fill={`url(#g${id})`} /> : null}
      {compare && compare.length > 1 ? <path d={path(compare)} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Faixa de cotações em movimento (pausa ao passar o mouse; parada com "reduzir movimento"). */
export function TickerMarquee() {
  const { user } = useSession();
  const { data } = useTickers();
  const list = (data?.tickers ?? []).filter((t) => ASSETS.some((a) => a.symbol === t.symbol)).slice(0, 20);
  // altura reservada desde o primeiro render: a faixa não empurra a página quando as cotações chegam
  if (!list.length) return <div className="h-[37px] border-b border-border bg-card/60" aria-hidden="true" />;
  const row = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === "b"} inert={key === "b"}>
      {list.map((t) => {
        const a = ASSETS.find((x) => x.symbol === t.symbol);
        return (
          <Link key={`${key}${t.symbol}`} href={`/graficos?symbol=${t.symbol}`} prefetch={prefetchFor("/graficos", !!user)} className="flex h-9 items-center gap-2 border-r border-border px-5 text-[12.5px]">
            <span className={cn("text-muted-foreground", GLYPH_FONT_CLASS)}>{a?.glyph}</span>
            <span className="font-semibold">{t.symbol}</span>
            <span className="tabular">{formatPrice(t.price)}</span>
            <span className={cn("tabular", t.changePct24h >= 0 ? "text-success" : "text-danger")}>
              {t.changePct24h >= 0 ? "▲" : "▼"} {formatPct(Math.abs(t.changePct24h), 2, false)}
            </span>
          </Link>
        );
      })}
    </div>
  );
  return (
    <div className="marquee overflow-hidden border-b border-border bg-card/60" aria-label="Cotações ao vivo">
      <div className="marquee-track flex w-max">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

/** Grade única de ferramentas ordenadas por categoria, com a legenda das categorias acima. */
export function ToolsGrid({ tools, categories, hrefFor, ctaFor, compact }: { tools: Tool[]; categories: Array<{ key: string; label: string; purpose: string }>; hrefFor?: (t: Tool) => string; ctaFor?: (t: Tool) => string; compact?: boolean }) {
  const ordered = categories.flatMap((c) => tools.filter((t) => t.category === c.key));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {categories.map((c) => (
          <span key={c.key}>
            <span className="font-bold uppercase tracking-[0.12em] text-primary">{c.label}</span> <span className="text-muted-foreground">{c.purpose}</span>
          </span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ordered.map((t) => (
          <ToolCard key={t.href} tool={t} href={hrefFor?.(t)} cta={ctaFor?.(t) ?? "Abrir"} compact={compact} showCategory />
        ))}
      </div>
    </div>
  );
}
