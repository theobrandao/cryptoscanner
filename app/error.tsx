"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell className="py-16 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="mt-3 text-2xl font-bold">Algo deu errado</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {error.message || "Erro inesperado."}
        {error.digest ? ` (${error.digest})` : ""}
      </p>
      <Button className="mt-4" onClick={reset}>
        Tentar novamente
      </Button>
    </PageShell>
  );
}
