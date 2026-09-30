"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";

/**
 * Erro no layout raiz (fora da casca): substitui o documento inteiro, então define <html>/<body> e estilos
 * próprios (o CSS global não chega aqui; cores do design system escritas direto). Texto fixo; o código (digest)
 * só como referência para o suporte.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#070B14", color: "#F8FAFC", fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", textAlign: "center" }}>
        <title>Algo deu errado — CryptoScanner</title>
        <main style={{ maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <LogoSymbol size={40} />
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", margin: "20px 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle aria-hidden style={{ width: 20, height: 20, color: "#F59E0B" }} /> Algo deu errado
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#94A3B8", margin: 0 }}>Não conseguimos abrir o CryptoScanner agora. Tente de novo em instantes. Seus dados e configurações continuam salvos.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <button type="button" onClick={() => retry()} style={{ height: 36, padding: "0 16px", borderRadius: 8, border: 0, background: "#2563EB", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Tentar de novo
            </button>
            {/* link comum (não next/link): recarrega o documento inteiro, já que o layout raiz é o que falhou */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid rgba(148,163,184,.16)", background: "#111A2C", color: "#CBD5E1", fontSize: 14, textDecoration: "none" }}>
              Voltar ao início
            </a>
          </div>
          {error.digest ? <p style={{ marginTop: 24, fontSize: 11, color: "#94A3B8" }}>Se o problema continuar, informe ao suporte o código {error.digest}.</p> : null}
        </main>
      </body>
    </html>
  );
}
