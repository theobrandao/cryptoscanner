import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/misc";

/** Esqueleto do Terminal: título com ícone, seletor de ativo e timeframes, abas e a área da análise. */
export default function TerminalLoading() {
  return (
    <div className="min-h-[100svh]" aria-busy="true">
      <PageShell>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="mt-2 h-4 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-10 w-64" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24" />
          ))}
        </div>
        <Skeleton className="mt-4 h-[480px] w-full" />
      </PageShell>
    </div>
  );
}
