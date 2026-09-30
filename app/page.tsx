import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/marketing/landing";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { HomeEntry } from "@/components/home/home-view";
import { buildLandingData } from "@/lib/marketing/landing-data";
import { JsonLd, organizationLd, websiteLd } from "@/lib/seo/json-ld";
import { HOME_METADATA } from "@/lib/seo/metadata";

export const metadata: Metadata = HOME_METADATA;

/**
 * Rota dinâmica da Início: só recebe quem tem cookie de sessão ou links antigos com ?symbol= (o visitante sem
 * cookie é reescrito pelo proxy.ts para a página estática app/visitante).
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
  // visitante sem sessão recebe a página de venda já renderizada no servidor (sem esperar /api/auth/me)
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token).catch(() => null) : null;
  const ld = <JsonLd data={[organizationLd(), websiteLd()]} />;
  if (!session)
    return (
      <>
        {ld}
        <Landing content={landing} />
      </>
    );
  return <HomeEntry landing={landing} />;
}
