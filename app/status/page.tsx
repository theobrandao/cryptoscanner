import type { Metadata } from "next";
import { StatusView } from "@/components/status/status-view";

export const metadata: Metadata = { title: "Status do sistema", description: "Banco, cache, provedores de mercado e jobs agendados." };

export default function StatusPage() {
  return <StatusView />;
}
