import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/misc";
import { BrandLoader } from "@/components/brand/brand-loader";

/** Painel de controle carregando: marca no lugar do título; abas, números e tabela mantêm o formato (sem salto de layout). */
export default function AdminLoading() {
  return (
    <div className="min-h-[100svh]" aria-busy="true">
      <PageShell className="max-w-[1400px]">
        <div className="flex h-[3.25rem] items-center gap-3">
          <BrandLoader size={32} label="Carregando o Painel de controle…" showLabel className="flex-row" />
        </div>
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
