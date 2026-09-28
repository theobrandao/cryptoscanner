"use client";

import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

/**
 * Aviso de origem dos dados. Reproduz o comportamento observado ("Binance temporariamente
 * indisponível. Usando última coleta disponível" / "Dados com defasagem") informando a fonte real.
 */
export function ProviderBanner({ sources, stale, onRetry, loading }: { sources?: string[]; stale?: boolean; onRetry?: () => void; loading?: boolean }) {
  const usingFallback = sources && sources.length > 0 && !sources.includes("binance");
  if (!usingFallback && !stale) return null;
  const retry = onRetry ? (
    <Button size="sm" variant="outline" onClick={onRetry} loading={loading}>
      <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
    </Button>
  ) : null;
  if (stale) {
    return (
      <Alert variant="warning" title="Dados com defasagem" action={retry}>
        Nenhum provedor respondeu na última coleta. Exibindo a última coleta disponível{sources?.length ? ` (${sources.join(", ")})` : ""}.
      </Alert>
    );
  }
  return (
    <Alert variant="warning" title="Binance temporariamente indisponível" action={retry}>
      Usando dados de {sources?.join(", ")} (fallback público). Preços em USD podem diferir marginalmente dos pares USDT da Binance.
    </Alert>
  );
}
