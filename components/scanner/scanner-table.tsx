"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowDown, ArrowUp, ArrowUpDown, Pause, Play, RefreshCw, Search, Star } from "lucide-react";
import type { ScannerRow } from "@/agents/scanner-agent";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton, Alert, EmptyState } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hint } from "@/components/ui/tooltip";
import { useFavorites } from "@/hooks/use-local-storage";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS } from "@/lib/assets";
import { ApiClientError } from "@/lib/client-api";
import { DIRECTION_LABEL, MOMENTUM_LABEL, formatCompact, formatPct, formatPrice, timeAgo } from "@/lib/format";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types/market";

interface TablePayload {
  rows: ScannerRow[];
  scannedAt: number;
  sources: string[];
  staleCount: number;
  errors: Array<{ symbol: string; error: string }>;
  cached: boolean;
  assetsAnalyzed: number;
}

type SortKey = "symbol" | "price" | "changePct24h" | "quoteVolume24h" | "relativeVolume" | "volatilityPct" | "trendStrength" | "rsi14" | "momentum" | "signalScore" | "patterns";

const MOM_ORDER: Record<string, number> = { strong_down: -2, down: -1, flat: 0, up: 1, strong_up: 2 };
const PAGE_SIZES = [10, 20, 50];

export function ScannerTable({
  timeframe,
  currency,
  usdBrl,
  onSourcesChange,
}: {
  timeframe: Timeframe;
  currency: "USD" | "BRL";
  usdBrl: number | null;
  onSourcesChange?: (info: { sources: string[]; stale: boolean; scannedAt: number }) => void;
}) {
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const { data, error, isLoading, isValidating, mutate } = useSWR<TablePayload>(`/api/scanner/table?timeframe=${timeframe}`, { refreshInterval: autoRefresh ? 30_000 : 0, keepPreviousData: true });
  const { bySymbol: liveTickers, connected } = useTickers(true);
  const { favorites, toggle, isFavorite } = useFavorites();

  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("quoteVolume24h");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [trendFilter, setTrendFilter] = React.useState<"all" | "bullish" | "bearish" | "neutral">("all");
  const [signalFilter, setSignalFilter] = React.useState<"all" | "bullish" | "bearish" | "neutral">("all");
  const [minVolume, setMinVolume] = React.useState<string>("0");
  const [minVolatility, setMinVolatility] = React.useState<string>("0");
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const [onlyPatterns, setOnlyPatterns] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  React.useEffect(() => {
    if (data && onSourcesChange) onSourcesChange({ sources: data.sources, stale: data.staleCount > 0, scannedAt: data.scannedAt });
  }, [data, onSourcesChange]);

  const rows = React.useMemo(() => {
    const base = (data?.rows ?? []).map((r) => {
      const live = liveTickers.get(r.symbol);
      return live ? { ...r, price: live.price, changePct24h: live.changePct24h, quoteVolume24h: live.quoteVolume24h, volume24h: live.volume24h } : r;
    });
    const q = query.trim().toLowerCase();
    const minVol = Number(minVolume) || 0;
    const minVola = Number(minVolatility) || 0;
    const filtered = base.filter((r) => {
      const asset = ASSETS.find((a) => a.symbol === r.symbol);
      if (q && !(r.symbol.toLowerCase().includes(q) || asset?.name.toLowerCase().includes(q))) return false;
      if (trendFilter !== "all" && r.trend !== trendFilter) return false;
      if (signalFilter !== "all" && r.signal !== signalFilter) return false;
      if (minVol > 0 && (r.quoteVolume24h ?? 0) < minVol * 1e6) return false;
      if (minVola > 0 && !(r.atrPct >= minVola)) return false;
      if (onlyFavorites && !favorites.includes(r.symbol)) return false;
      if (onlyPatterns && r.patterns.length === 0) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: ScannerRow): number | string => {
      switch (sortKey) {
        case "symbol":
          return r.symbol;
        case "momentum":
          return MOM_ORDER[r.momentum] ?? 0;
        case "patterns":
          return r.patterns[0]?.confidence ?? -1;
        default: {
          const v = r[sortKey];
          return typeof v === "number" && Number.isFinite(v) ? v : -Infinity;
        }
      }
    };
    return filtered.sort((a, b) => {
      const fa = favorites.includes(a.symbol) ? 1 : 0;
      const fb = favorites.includes(b.symbol) ? 1 : 0;
      if (fa !== fb) return fb - fa; // favoritos primeiro
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [data, liveTickers, query, trendFilter, signalFilter, minVolume, minVolatility, onlyFavorites, onlyPatterns, favorites, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const sortBy = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
    setPage(1);
  };

  if (error) {
    const msg = error instanceof ApiClientError ? error.message : "Erro ao carregar dados. Tente novamente em instantes.";
    return (
      <Alert
        variant="danger"
        title="Erro ao carregar dados"
        action={
          <Button size="sm" variant="outline" onClick={() => void mutate()}>
            Tentar novamente
          </Button>
        }
      >
        {msg}
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar ativo…"
            className="pl-8"
            aria-label="Buscar ativo"
          />
        </div>
        <FilterSelect
          label="Tendência"
          value={trendFilter}
          onChange={(v) => {
            setTrendFilter(v as typeof trendFilter);
            setPage(1);
          }}
          options={[
            ["all", "Todas"],
            ["bullish", "Alta"],
            ["bearish", "Baixa"],
            ["neutral", "Neutra"],
          ]}
        />
        <FilterSelect
          label="Sinal"
          value={signalFilter}
          onChange={(v) => {
            setSignalFilter(v as typeof signalFilter);
            setPage(1);
          }}
          options={[
            ["all", "Todos"],
            ["bullish", "Alta"],
            ["bearish", "Baixa"],
            ["neutral", "Neutro"],
          ]}
        />
        <FilterSelect
          label="Volume 24h ≥"
          value={minVolume}
          onChange={(v) => {
            setMinVolume(v);
            setPage(1);
          }}
          options={[
            ["0", "Qualquer"],
            ["1", "$1M"],
            ["10", "$10M"],
            ["100", "$100M"],
            ["1000", "$1B"],
          ]}
        />
        <FilterSelect
          label="Volatilidade (ATR) ≥"
          value={minVolatility}
          onChange={(v) => {
            setMinVolatility(v);
            setPage(1);
          }}
          options={[
            ["0", "Qualquer"],
            ["0.5", "0,5%"],
            ["1", "1%"],
            ["2", "2%"],
            ["3", "3%"],
          ]}
        />
        <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={onlyFavorites}
            onChange={(e) => {
              setOnlyFavorites(e.target.checked);
              setPage(1);
            }}
            className="accent-[var(--primary)]"
          />{" "}
          Favoritos
        </label>
        <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={onlyPatterns}
            onChange={(e) => {
              setOnlyPatterns(e.target.checked);
              setPage(1);
            }}
            className="accent-[var(--primary)]"
          />{" "}
          Com padrão
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Hint text={connected ? "Preços ao vivo via SSE" : "Preços por polling (10 s)"}>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success live-dot" : "bg-warning")} /> {connected ? "AO VIVO" : "POLLING"}
            </span>
          </Hint>
          <Button size="sm" variant="outline" onClick={() => setAutoRefresh((v) => !v)} aria-pressed={autoRefresh}>
            {autoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {autoRefresh ? "Auto 30s" : "Pausado"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void mutate()} loading={isValidating && !isLoading}>
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="🔎" title="Nenhum ativo corresponde aos filtros" description="Ajuste a busca ou os filtros de tendência, volume e volatilidade." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <Th k="symbol" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>
                Ativo
              </Th>
              <Th k="price" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="text-right">
                Preço
              </Th>
              <Th k="changePct24h" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="text-right">
                24h
              </Th>
              <Th k="quoteVolume24h" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="text-right">
                Volume 24h
              </Th>
              <Th k="relativeVolume" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="text-right" hint="Volume do último candle ÷ média dos 20 anteriores">
                Vol. rel.
              </Th>
              <Th k="volatilityPct" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="text-right" hint="ATR(14) em % do preço · desvio dos retornos (20)">
                Volatilidade
              </Th>
              <Th k="trendStrength" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} hint="Classificação por EMAs 8/25/100 e inclinação">
                Tendência
              </Th>
              <Th k="rsi14" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="text-right">
                RSI
              </Th>
              <Th k="momentum" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} hint="RSI + histograma MACD + ROC(10)">
                Momentum
              </Th>
              <Th k="signalScore" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} hint="Agregação ponderada dos sinais técnicos">
                Sinal
              </Th>
              <Th k="patterns" sortKey={sortKey} sortDir={sortDir} onSort={sortBy}>
                Padrão
              </Th>
              <TableHead className="text-right">Atual.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => {
              const asset = ASSETS.find((a) => a.symbol === r.symbol);
              const top = r.patterns[0];
              return (
                <TableRow key={r.symbol}>
                  <TableCell>
                    <button onClick={() => toggle(r.symbol)} aria-label={isFavorite(r.symbol) ? "Remover dos favoritos" : "Adicionar aos favoritos"} className="cursor-pointer">
                      <Star className={cn("h-4 w-4", isFavorite(r.symbol) ? "fill-warning text-warning" : "text-muted-foreground/60 hover:text-warning")} />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Link href={`/graficos?symbol=${r.symbol}&timeframe=${timeframe}`} className="flex items-center gap-2 hover:underline">
                      <span className="w-5 text-center text-muted-foreground">{asset?.glyph}</span>
                      <span className="font-semibold">{r.symbol}</span>
                      <span className="hidden text-xs text-muted-foreground md:inline">{asset?.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular font-medium">{formatPrice(r.price, currency, usdBrl ?? 1)}</TableCell>
                  <TableCell className={cn("text-right tabular", (r.changePct24h ?? 0) > 0 && "text-success", (r.changePct24h ?? 0) < 0 && "text-danger")}>{formatPct(r.changePct24h)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{formatCompact(r.quoteVolume24h)}</TableCell>
                  <TableCell className={cn("text-right tabular", r.relativeVolume >= 2 && "text-warning font-semibold")}>
                    {Number.isFinite(r.relativeVolume) ? `${r.relativeVolume.toFixed(2)}×` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    <span>{Number.isFinite(r.atrPct) ? `${r.atrPct.toFixed(2)}%` : "—"}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{Number.isFinite(r.volatilityPct) ? `σ ${r.volatilityPct.toFixed(2)}%` : ""}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <DirectionBadge direction={r.trend} />
                      <span className="text-xs text-muted-foreground tabular">{r.trendStrength}</span>
                    </div>
                  </TableCell>
                  <TableCell className={cn("text-right tabular", r.rsi14 >= 70 && "text-danger", r.rsi14 <= 30 && "text-success")}>{Number.isFinite(r.rsi14) ? r.rsi14.toFixed(1) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.momentum.includes("up") ? "success" : r.momentum.includes("down") ? "danger" : "muted"}>{MOMENTUM_LABEL[r.momentum]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Hint text={`score ${r.signalScore} · confiança ${r.signalConfidence}/100`}>
                      <span>
                        <DirectionBadge direction={r.signal} />
                      </span>
                    </Hint>
                  </TableCell>
                  <TableCell>
                    {top ? (
                      <Hint text={top.summary}>
                        <span className={cn("text-xs font-medium", top.direction === "bullish" && "text-success", top.direction === "bearish" && "text-danger")}>
                          {top.label} <span className="text-muted-foreground">({top.confidence})</span>
                          {r.patterns.length > 1 ? <span className="text-muted-foreground"> +{r.patterns.length - 1}</span> : null}
                        </span>
                      </Hint>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <Hint text={`Candle ${TIMEFRAME_LABEL[timeframe]} · fonte ${r.source}${r.stale ? " (obsoleto)" : ""}`}>
                      <span>{timeAgo(liveTickers.get(r.symbol)?.updatedAt ?? data?.scannedAt)}</span>
                    </Hint>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          {rows.length} de {data?.rows.length ?? 0} ativos · tendência: {DIRECTION_LABEL[trendFilter] ?? "todas"} · scan {timeAgo(data?.scannedAt)}
          {data?.errors.length ? ` · ${data.errors.length} ativo(s) sem dados` : ""}
        </div>
        <div className="flex items-center gap-2">
          <span>Por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-7 w-[70px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </Button>
          <span className="tabular">
            {safePage}/{totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            ›
          </Button>
        </div>
      </div>
    </div>
  );
}

function Th({
  k,
  children,
  className,
  hint,
  sortKey,
  sortDir,
  onSort,
}: {
  k: SortKey;
  children: React.ReactNode;
  className?: string;
  hint?: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const head = (
    <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground cursor-pointer", sortKey === k && "text-foreground")}>
      {children}
      {sortKey === k ? sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
  return <TableHead className={className}>{hint ? <Hint text={hint}>{head}</Hint> : head}</TableHead>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[140px]" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
