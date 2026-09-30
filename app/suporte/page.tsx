import type { Metadata } from "next";
import { SupportForm } from "@/components/account/support-form";
import { supportSubjectFromParam } from "@/lib/plans-copy";

export const metadata: Metadata = { title: "Suporte" };

/** `?assunto=` (links de pagamento, cancelamento e reativação) chega já preenchido no formulário. */
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { assunto } = await searchParams;
  return <SupportForm initialSubject={supportSubjectFromParam(assunto)} />;
}
