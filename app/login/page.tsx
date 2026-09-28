import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { PageShell } from "@/components/layout/page-shell";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <PageShell className="py-10">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </PageShell>
  );
}
