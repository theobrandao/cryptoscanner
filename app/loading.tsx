import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <PageShell>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96" />
      <Skeleton className="mt-6 h-64 w-full" />
    </PageShell>
  );
}
