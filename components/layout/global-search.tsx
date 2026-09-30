"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CandlestickChart, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ASSETS, GLYPH_FONT_CLASS } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { ADVANCED_NAV, EXTRA_PAGES, FOOT_NAV, PRIMARY_NAV } from "./nav-links";

const INDICATORS = ["EMA", "RSI", "MACD", "ATR", "Bollinger", "StochRSI"];

/** Busca global (Ctrl/Cmd+K): ativos, ferramentas e indicadores. Carregada sob demanda pela casca (app-shell). */
export default function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = React.useState("");
  const router = useRouter();
  const term = q.trim().toLowerCase();
  const assets = ASSETS.filter((a) => !term || a.symbol.toLowerCase().includes(term) || a.name.toLowerCase().includes(term)).slice(0, 8);
  const pages = [...PRIMARY_NAV, ...ADVANCED_NAV, ...FOOT_NAV, ...EXTRA_PAGES].filter((n) => term && n.label.toLowerCase().includes(term));
  const indicators = INDICATORS.filter((i) => term && i.toLowerCase().includes(term));
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 p-0">
        <DialogHeader className="p-3 pb-0">
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && assets[0] && go(`/graficos?symbol=${assets[0].symbol}`)}
              placeholder="Buscar ativo, ferramenta ou indicador…"
              aria-label="Buscar ativo, ferramenta ou indicador"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
            {q ? (
              <button className="absolute right-3 top-3 opacity-60 hover:opacity-100" onClick={() => setQ("")} aria-label="Limpar">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto p-2 text-sm">
          {pages.map((p) => (
            <button key={p.label} onClick={() => go(p.href)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <p.icon className="h-4 w-4 text-muted-foreground" /> {p.label}
            </button>
          ))}
          {indicators.map((i) => (
            <button key={i} onClick={() => go(`/graficos`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <CandlestickChart className="h-4 w-4 text-muted-foreground" /> {i} <span className="ml-auto text-xs text-muted-foreground">indicador · Gráficos</span>
            </button>
          ))}
          <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Ativos</div>
          {assets.map((a) => (
            <button key={a.symbol} onClick={() => go(`/graficos?symbol=${a.symbol}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <span className={cn("w-5 text-center text-muted-foreground", GLYPH_FONT_CLASS)} aria-hidden>
                {a.glyph}
              </span>
              <span className="font-semibold">{a.symbol}/USDT</span>
              <span className="text-muted-foreground">{a.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
