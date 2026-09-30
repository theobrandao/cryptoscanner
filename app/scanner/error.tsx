"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Erro só nesta área: o menu e o topo continuam na tela. */
export default function AreaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} area="o Scanner" />;
}
