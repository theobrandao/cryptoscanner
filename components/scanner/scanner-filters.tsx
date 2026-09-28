"use client";

import * as React from "react";
import { Lock, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ASSETS } from "@/lib/assets";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types/market";

export type PatternDirection = "all" | "bullish" | "bearish";

export interface ScannerFilterState {
  timeframe: Timeframe;
  direction: PatternDirection;
  symbol: "ALL" | string;
  /** confiança mínima dos padrões (60–85) */
  minConfidence: number;
}

/** Ordem observada na referência: 4H, 1D, 7D livres; 1H, 30M, 15M bloqueados fora do PLATINUM. */
const TIMEFRAME_ORDER: Timeframe[] = ["4h", "1d", "1w", "1h", "30m", "15m"];

export function ScannerFilters({
  value,
  onChange,
  allowedTimeframes,
  onScan,
  scanning,
  onLockedClick,
}: {
  value: ScannerFilterState;
  onChange: (v: ScannerFilterState) => void;
  allowedTimeframes: readonly Timeframe[];
  onScan: () => void;
  scanning: boolean;
  onLockedClick: (tf: Timeframe) => void;
}) {
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-[auto_auto_1fr_auto_auto] lg:items-end">
      <div className="flex flex-col gap-1.5">
        <Label>Timeframe</Label>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Timeframe">
          {TIMEFRAME_ORDER.map((tf) => {
            const locked = !allowedTimeframes.includes(tf);
            const active = value.timeframe === tf;
            const btn = (
              <button
                key={tf}
                role="radio"
                aria-checked={active}
                onClick={() => (locked ? onLockedClick(tf) : onChange({ ...value, timeframe: tf }))}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-semibold transition-colors cursor-pointer",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  locked && "opacity-70",
                )}
              >
                {TIMEFRAME_LABEL[tf]}
                {locked ? <Lock className="h-3 w-3" /> : null}
              </button>
            );
            return locked ? (
              <Hint key={tf} text="Exclusivo do plano PLATINUM">
                {btn}
              </Hint>
            ) : (
              btn
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Tipo de padrão</Label>
        <div className="flex gap-1" role="radiogroup" aria-label="Tipo de padrão">
          {(
            [
              ["all", "Todos"],
              ["bullish", "▲ Alta"],
              ["bearish", "▼ Baixa"],
            ] as Array<[PatternDirection, string]>
          ).map(([d, label]) => (
            <button
              key={d}
              role="radio"
              aria-checked={value.direction === d}
              onClick={() => onChange({ ...value, direction: d })}
              className={cn(
                "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors cursor-pointer",
                value.direction === d ? "border-primary bg-primary/15 text-primary" : "border-border bg-background hover:bg-muted",
                d === "bullish" && value.direction === d && "border-success bg-success/15 text-success",
                d === "bearish" && value.direction === d && "border-danger bg-danger/15 text-danger",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 lg:max-w-xs">
        <Label>Moeda</Label>
        <Select value={value.symbol} onValueChange={(s) => onChange({ ...value, symbol: s })}>
          <SelectTrigger aria-label="Moeda">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">🌐 Todas ({ASSETS.length} ativos)</SelectItem>
            {ASSETS.map((a) => (
              <SelectItem key={a.symbol} value={a.symbol}>
                {a.glyph} {a.symbol} — {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-full flex-col gap-1.5 lg:w-40">
        <Label>
          Confiança mín. <span className="text-foreground">{value.minConfidence ?? 60}</span>
        </Label>
        <Slider min={55} max={85} step={5} value={[value.minConfidence ?? 60]} onValueChange={([v]) => onChange({ ...value, minConfidence: v ?? 60 })} className="h-9" aria-label="Confiança mínima" />
      </div>

      <Button size="lg" onClick={onScan} loading={scanning} className="w-full lg:w-auto">
        <Radar className="h-4 w-4" /> Escanear Agora
      </Button>
    </div>
  );
}
