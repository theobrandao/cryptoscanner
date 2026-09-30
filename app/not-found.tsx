import Link from "next/link";
import { BookOpen, Compass, Home } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell className="flex min-h-[60svh] flex-col items-center justify-center py-16 text-center">
      <span className="icon-tile grid h-12 w-12 place-items-center rounded-xl" aria-hidden>
        <Compass className="h-6 w-6 text-primary" />
      </span>
      <h1 className="mt-4 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted-foreground">O endereço não existe ou foi movido.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants()}>
          <Home className="h-4 w-4" aria-hidden /> Voltar ao início
        </Link>
        <Link href="/jornada" className={buttonVariants({ variant: "outline" })}>
          <BookOpen className="h-4 w-4" aria-hidden /> Ver a Jornada grátis
        </Link>
      </div>
    </PageShell>
  );
}
