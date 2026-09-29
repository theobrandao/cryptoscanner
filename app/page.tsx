import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomeEntry } from "@/components/home/home-view";
import { LESSONS } from "@/lib/content/lessons";
import { STRATEGY_TEMPLATES } from "@/lib/strategies/definition";

export const metadata: Metadata = {
  title: "CryptoScanner — scanner cripto com sinais validados",
  description: "Padrões gráficos, agentes com alertas, sinais de rompimento validados fora da amostra, gráficos, Fibonacci, simulador e aulas. Teste grátis de 7 dias.",
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
  const landing = {
    validated: STRATEGY_TEMPLATES.filter((t) => t.validation).map((t) => ({ name: t.name, description: t.description, validation: t.validation! })),
    lessonTitles: LESSONS.map((l) => l.title),
  };
  return <HomeEntry landing={landing} />;
}
