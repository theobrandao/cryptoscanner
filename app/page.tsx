import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomeEntry } from "@/components/home/home-view";
import { buildLandingData } from "@/lib/marketing/landing-data";

export const metadata: Metadata = {
  title: "CryptoScanner — scanner cripto com sinais validados",
  description: "Padrões gráficos, agentes com alertas, sinais de rompimento validados fora da amostra, gráficos, Fibonacci, simulador e aulas. Teste grátis de 3 dias no PRO.",
};

/**
 * Visitante: página de venda. Usuário logado: Início (mercado agora, sinais ativos e ferramentas).
 * Links antigos do Dashboard (/?symbol=…) seguem para a Análise completa do ativo.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const symbol = typeof sp.symbol === "string" ? sp.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (symbol) {
    const q = new URLSearchParams();
    for (const k of ["tf", "exchange", "instrument"]) {
      const v = sp[k];
      if (typeof v === "string") q.set(k, v);
    }
    redirect(`/charts/${symbol}${q.size ? `?${q.toString()}` : ""}`);
  }
  const landing = buildLandingData();
  return <HomeEntry landing={landing} />;
}
