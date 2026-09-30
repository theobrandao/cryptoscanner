import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { PageShell } from "@/components/layout/page-shell";

export const metadata: Metadata = publicPageMetadata({ path: "/registro", title: "Criar conta", description: "Crie sua conta no CryptoScanner e use o plano PRO por 3 dias grátis, sem cartão: scanner de padrões, agentes com alertas e análise de 30 criptos." });

export default function RegisterPage() {
  return (
    <PageShell className="py-10">
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </PageShell>
  );
}
