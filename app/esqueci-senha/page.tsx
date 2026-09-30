import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { ForgotPasswordForm } from "@/components/auth/password-reset";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function Page() {
  return (
    <PageShell className="py-10">
      <ForgotPasswordForm />
    </PageShell>
  );
}
