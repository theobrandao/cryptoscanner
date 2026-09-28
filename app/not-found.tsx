import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";

export default function NotFound() {
  return (
    <PageShell className="py-16 text-center">
      <div className="text-5xl">🧭</div>
      <h1 className="mt-3 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted-foreground">O endereço não existe ou foi movido.</p>
      <Link href="/scanner" className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        Ir para o Scanner
      </Link>
    </PageShell>
  );
}
