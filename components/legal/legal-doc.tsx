import * as React from "react";
import Link from "next/link";
import { getEnv } from "@/lib/env";

/** Dados do fornecedor/controlador vindos do ambiente. Nada é inventado: campo ausente aparece como "não configurado". */
export function legalEntity() {
  const env = getEnv();
  const nc = "[não configurado]";
  return {
    name: env.LEGAL_ENTITY_NAME ?? nc,
    doc: env.LEGAL_ENTITY_DOC ?? nc,
    address: env.LEGAL_ENTITY_ADDRESS ?? nc,
    email: env.SUPPORT_EMAIL ?? nc,
    dpo: env.DPO_EMAIL ?? env.SUPPORT_EMAIL ?? nc,
    version: env.LEGAL_TERMS_VERSION,
    approved: env.LEGAL_TERMS_APPROVED,
    pro: env.PRICE_PRO_BRL,
    elite: env.PRICE_ELITE_BRL,
    appUrl: env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
  };
}

export function LegalDoc({ title, children }: { title: string; children: React.ReactNode }) {
  const e = legalEntity();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {!e.approved ? (
        <p className="mb-5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning">
          Documento em revisão. As assinaturas pagas são liberadas somente após a publicação da versão definitiva.
        </p>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">Versão {e.version}</p>
      <nav className="mt-3 flex flex-wrap gap-3 text-[13px]" aria-label="Documentos legais">
        <Link href="/termos" className="text-primary hover:underline">
          Termos de Uso
        </Link>
        <Link href="/privacidade" className="text-primary hover:underline">
          Política de Privacidade
        </Link>
        <Link href="/reembolso" className="text-primary hover:underline">
          Cancelamento e Reembolso
        </Link>
      </nav>
      <article className="legal mt-6 space-y-4 text-[14px] leading-relaxed text-foreground/90 [&_h2]:mt-7 [&_h2]:text-[17px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</article>
    </main>
  );
}

export function EntityBlock() {
  const e = legalEntity();
  return (
    <ul>
      <li>Razão social: {e.name}</li>
      <li>CNPJ: {e.doc}</li>
      <li>Endereço: {e.address}</li>
      <li>Atendimento: {e.email}</li>
    </ul>
  );
}
