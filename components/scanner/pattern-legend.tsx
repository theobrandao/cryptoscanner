import { PATTERN_LIST } from "@/lib/patterns/catalog";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Lista dos 17 padrões suportados (▲ alta, ▼ baixa, ↔ neutro), com descrição em tooltip. */
export function PatternLegend() {
  const groups = [
    { key: "bullish", label: "▲ Alta", cls: "text-success border-success/30 bg-success/5" },
    { key: "bearish", label: "▼ Baixa", cls: "text-danger border-danger/30 bg-danger/5" },
    { key: "neutral", label: "↔ Neutro", cls: "text-muted-foreground border-border bg-muted/40" },
  ] as const;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {groups.map((g) => (
        <div key={g.key} className={cn("rounded-lg border p-3", g.cls)}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide">{g.label}</div>
          <ul className="flex flex-wrap gap-1.5">
            {PATTERN_LIST.filter((p) => p.direction === g.key).map((p) => (
              <li key={p.key}>
                <Hint text={p.description}>
                  <span className="inline-block cursor-help rounded-md border border-current/20 bg-background/60 px-2 py-0.5 text-xs font-medium text-foreground">{p.label}</span>
                </Hint>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
