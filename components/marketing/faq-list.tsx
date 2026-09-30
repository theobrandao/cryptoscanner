import type { FaqItem } from "@/lib/marketing/faq";
import { cn } from "@/lib/utils";

/**
 * Perguntas frequentes com todas as respostas no HTML (details/summary); a primeira começa aberta.
 * Sem estado: serve a componentes de cliente (landing, vendas, planos) e de servidor (/sobre).
 * Os mesmos itens alimentam o JSON-LD FAQPage (faqPageLd em lib/seo/json-ld.tsx).
 */
export function FaqList({ items, compact }: { items: ReadonlyArray<FaqItem>; compact?: boolean }) {
  return (
    <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map(([q, a], i) => (
        <details key={q} open={i === 0} className="group">
          <summary className={cn("flex w-full cursor-pointer list-none items-center justify-between gap-3 text-left text-[14px] font-semibold [&::-webkit-details-marker]:hidden", compact ? "min-h-[52px] px-4 py-3 sm:px-5" : "px-5 py-4")}>
            <span className="min-w-0">{q}</span>
            <span className="shrink-0 text-muted-foreground" aria-hidden>
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <p className={cn("pb-4 text-[13.5px] leading-relaxed text-muted-foreground", compact ? "px-4 sm:px-5" : "px-5")}>{a}</p>
        </details>
      ))}
    </div>
  );
}
