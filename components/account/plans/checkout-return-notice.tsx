"use client";

import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/misc";

/** Aviso de volta do checkout (?checkout=return). Isolado para que o resto de /planos seja renderizado no servidor. */
export function CheckoutReturnNotice({ via }: { via: string }) {
  const params = useSearchParams();
  if (params.get("checkout") !== "return") return null;
  return (
    <Alert variant="info" className="mb-4" title="Pagamento em processamento">
      A confirmação da {via} pode levar alguns minutos. Esta página atualiza sozinha.
    </Alert>
  );
}
