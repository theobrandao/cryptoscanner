import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/misc";

/** Ocupa a altura da tela: o rodapé não aparece acima da dobra e não "pula" quando o conteúdo chega. */
export default function Loading() {
  return (
    <div className="min-h-[100svh]">
      <PageShell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <Skeleton className="mt-6 h-64 w-full" />
      </PageShell>
    </div>
  );
}
