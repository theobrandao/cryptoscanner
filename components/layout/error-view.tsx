"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Tela de erro das rotas (app/error.tsx e error.tsx por área). Texto fixo em português: a mensagem técnica
 * do erro nunca vai para a tela; o código (digest) aparece pequeno, só para o suporte achar o registro.
 */
export function ErrorView({ error, retry, area }: { error: Error & { digest?: string }; retry: () => void; area?: string }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <PageShell className="flex min-h-[60svh] flex-col items-center justify-center py-16 text-center">
      <span className="icon-tile grid h-12 w-12 place-items-center rounded-xl" aria-hidden>
        <AlertTriangle className="h-6 w-6 text-warning" />
      </span>
      <h1 className="mt-4 text-2xl font-bold">Algo deu errado</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {area ? `Não conseguimos carregar ${area} agora.` : "Não conseguimos carregar esta página agora."} Tente de novo em instantes. Seus dados e configurações continuam salvos.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Tentar de novo
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          <Home className="h-4 w-4" aria-hidden /> Voltar ao início
        </Link>
      </div>
      {error.digest ? <p className="mt-6 text-[11px] text-muted-foreground">Se o problema continuar, informe ao suporte o código {error.digest}.</p> : null}
    </PageShell>
  );
}
