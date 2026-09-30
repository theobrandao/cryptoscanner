"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Erro numa página: a casca (menu e topo) continua; só o conteúdo troca por esta tela. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
