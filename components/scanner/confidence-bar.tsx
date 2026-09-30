import { cn } from "@/lib/utils";

/**
 * Confiança do scanner: barra discreta de 4 px + percentual (design system → scanner.confidence).
 * Cor de marca, não verde/vermelho: confiança não é resultado financeiro.
 */
export function ConfidenceBar({ value, className, barClassName, label = "Confiança" }: { value: number | null | undefined; className?: string; barClassName?: string; label?: string }) {
  const v = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? undefined} aria-valuetext={v == null ? "sem dado" : `${v}%`}>
      <span aria-hidden className={cn("h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted", barClassName)}>
        <span className="block h-full rounded-full bg-info" style={{ width: `${v ?? 0}%` }} />
      </span>
      <span className="tabular text-xs font-medium text-muted-foreground">{v == null ? "—" : `${v}%`}</span>
    </span>
  );
}
