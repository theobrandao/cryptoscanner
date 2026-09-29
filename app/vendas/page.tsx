import type { Metadata } from "next";
import { SalesPage } from "@/components/marketing/sales-page";
import { buildLandingData } from "@/lib/marketing/landing-data";

export const metadata: Metadata = {
  title: { absolute: "CryptoScanner — padrões, sinais testados e alertas de cripto" },
  description: "Scanner de 17 padrões gráficos, modelo de rompimento testado fora da amostra, agentes com alertas por push e Telegram e ferramentas de análise para 30 criptos. 3 dias grátis no PRO, sem cartão.",
  alternates: { canonical: "/vendas" },
  openGraph: { title: "CryptoScanner — padrões, sinais testados e alertas de cripto", description: "3 dias grátis no PRO, sem cartão. Garantia de 7 dias na compra.", type: "website" },
};

/** Página de vendas: destino dos anúncios e URL da página de vendas cadastrada na Kiwify. */
export default function VendasPage() {
  return <SalesPage content={buildLandingData()} />;
}
