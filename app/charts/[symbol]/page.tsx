import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TerminalWorkspace } from "@/components/terminal/workspace";
import { getAsset } from "@/lib/assets";

export async function generateMetadata({ params }: PageProps<"/charts/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const s = symbol.toUpperCase().replace(/USDT$/, "");
  return { title: `${s}/USDT — Charts`, description: `Terminal ${s}/USDT: gráfico, estrutura, liquidez, confluência, derivativos, histórico e risco.` };
}

export default async function ChartsPage({ params }: PageProps<"/charts/[symbol]">) {
  const { symbol } = await params;
  const s = symbol.toUpperCase().replace(/USDT$/, "");
  if (!getAsset(s)) notFound();
  return (
    <Suspense>
      <TerminalWorkspace symbol={s} mode="charts" />
    </Suspense>
  );
}
