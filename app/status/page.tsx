import type { Metadata } from "next";
import { StatusView } from "@/components/status/status-view";

export const metadata: Metadata = {
  title: "Status do sistema",
  description:
    "Estado das fontes de dados de mercado, das rotinas automáticas e dos serviços do CryptoScanner.",
};

export default function StatusPage() {
  return <StatusView />;
}
