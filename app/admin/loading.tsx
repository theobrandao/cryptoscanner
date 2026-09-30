import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/misc";

/** Esqueleto do Painel de controle: título, abas e os blocos da visão geral (situação do checkout e números). */
export default function AdminLoading() {
  return (
    <div className="min-h-[100svh]" aria-busy="true">
      <PageShell className="max-w-[1400px]">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="mt-4 h-28 w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="mt-4 h-56 w-full" />
      </PageShell>
    </div>
  );
}
