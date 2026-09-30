import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { AnalystChat } from "@/components/analyst/analyst-chat";
import { PageShell, PageTitle } from "@/components/layout/page-shell";

export const metadata: Metadata = { title: "Analista IA", description: "Converse sobre os 30 ativos: o analista consulta as ferramentas do CryptoScanner e responde só com os números delas." };

export default function AnalistaPage() {
  return (
    <PageShell className="flex min-h-[calc(100vh-56px)] flex-col pb-20 lg:min-h-screen lg:pb-6">
      <PageTitle icon={<Bot className="h-6 w-6 text-primary" />} title="Analista IA" description="Pergunte sobre estrutura, níveis, sinais do modelo, padrões e taxa de acerto. Cada número vem de uma ferramenta do app; nada é recomendação." />
      <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <AnalystChat />
      </div>
    </PageShell>
  );
}
