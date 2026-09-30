"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Erro no layout raiz (fora da casca): substitui o documento inteiro, então define <html>/<body> e estilos
 * próprios (o CSS global não chega aqui). Texto fixo; o código (digest) só como referência para o suporte.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#07101a", color: "#e6edf5", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", textAlign: "center" }}>
        <title>Algo deu errado — CryptoScanner</title>
        <main style={{ maxWidth: 440 }}>
          <AlertTriangle aria-hidden style={{ width: 40, height: 40, color: "#f5a524" }} />
          <h1 style={{ fontSize: 24, margin: "16px 0 8px" }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#8193a8", margin: 0 }}>Não conseguimos abrir o CryptoScanner agora. Tente de novo em instantes. Seus dados e configurações continuam salvos.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <button type="button" onClick={() => retry()} style={{ height: 36, padding: "0 16px", borderRadius: 6, border: 0, background: "#2d67f7", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Tentar de novo
            </button>
            {/* link comum (não next/link): recarrega o documento inteiro, já que o layout raiz é o que falhou */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", color: "#e6edf5", fontSize: 14, textDecoration: "none" }}>
              Voltar ao início
            </a>
          </div>
          {error.digest ? <p style={{ marginTop: 24, fontSize: 11, color: "#8193a8" }}>Se o problema continuar, informe ao suporte o código {error.digest}.</p> : null}
        </main>
      </body>
    </html>
  );
}
