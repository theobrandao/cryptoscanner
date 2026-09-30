import Link from "next/link";
import { BookOpen, Home } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell className="flex min-h-[60svh] flex-col items-center justify-center py-16 text-center">
      <LogoSymbol size={36} />
      <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Erro 404</p>
      <h1 className="mt-1 text-2xl font-bold tracking-[-0.025em]">Página não encontrada</h1>
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
