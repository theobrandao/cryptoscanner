import type { Metadata } from "next";
import { ScannerView } from "@/components/scanner/scanner-view";

export const metadata: Metadata = {
  title: "Padrões gráficos — CryptoScanner",
  description: "Detecta padrões gráficos em formação em Bitcoin e altcoins com análise técnica programática e agentes de IA.",
};

export default function ScannerPage() {
  return <ScannerView />;
}
