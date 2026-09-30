import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { ResetPasswordForm } from "@/components/auth/password-reset";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };

export default function Page() {
  return (
    <PageShell className="py-10">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </PageShell>
  );
}
