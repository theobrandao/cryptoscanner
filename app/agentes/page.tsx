import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentsView } from "@/components/agents/agents-view";

export const metadata: Metadata = { title: "Agentes de IA", description: "Crie e gerencie agentes autônomos com estratégias configuráveis e alertas." };

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsView />
    </Suspense>
  );
}
