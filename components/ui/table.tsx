import * as React from "react";
import { cn } from "@/lib/utils";

/** Tabela do design system: linhas de 44 px, hover rgba(255,255,255,.025), sem zebra; números com tabular-nums. */
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm tabular-nums", className)} {...props} />
    </div>
  );
}
/** `sticky` fixa o cabeçalho ao rolar (o contêiner com rolagem vertical precisa estar em volta da tabela). */
export function TableHeader({ className, sticky, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:hover:bg-transparent", sticky && "sticky top-0 z-(--z-sticky) bg-card", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border transition-colors duration-150 hover:bg-[var(--row-hover)] data-[state=selected]:bg-primary/10 motion-reduce:transition-none", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap", className)} {...props} />;
}
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-11 px-3 py-2 align-middle whitespace-nowrap", className)} {...props} />;
}
