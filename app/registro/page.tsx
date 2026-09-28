import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { PageShell } from "@/components/layout/page-shell";

export const metadata: Metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <PageShell className="py-10">
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </PageShell>
  );
}
