import * as React from "react";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Cor financeira de uma variação: verde sobe, vermelho cai, neutro sem variação/sem dado. */
export function changeTone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-success" : "text-danger";
}

/** Seta de direção que acompanha a cor (nunca informar só pela cor). */
export function changeArrow(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "▲" : "▼";
}

/** Variação percentual com seta + sinal + cor financeira, números tabulares. */
export function Change({ value, decimals = 2, className, suffix, colored = true }: { value: number | null | undefined; decimals?: number; className?: string; suffix?: React.ReactNode; colored?: boolean }) {
  const arrow = changeArrow(value);
  return (
    <span className={cn("tabular whitespace-nowrap", colored && changeTone(value), className)}>
      {arrow ? (
        <span aria-hidden className="mr-0.5 text-[0.8em]">
          {arrow}
        </span>
      ) : null}
      {formatPct(value, decimals)}
      {suffix}
    </span>
  );
}
