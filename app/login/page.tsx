import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { PageShell } from "@/components/layout/page-shell";

export const metadata: Metadata = publicPageMetadata({ path: "/login", title: "Entrar", description: "Entre na sua conta do CryptoScanner para usar o scanner de padrões, os agentes com alertas, a carteira e as demais ferramentas." });

export default function LoginPage() {
  return (
    <PageShell className="py-10">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </PageShell>
  );
}
