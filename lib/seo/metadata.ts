import type { Metadata } from "next";

/** Imagem de compartilhamento gerada por app/opengraph-image.tsx (repetida aqui porque `openGraph` da página substitui o do layout). */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "CryptoScanner — padrões gráficos, sinais testados e alertas de cripto" };

/**
 * Metadados de página pública: título, descrição própria, canonical e og:url no mesmo caminho.
 * `absoluteTitle` ignora o modelo "%s — CryptoScanner" do layout.
 */
export function publicPageMetadata({ path, title, description, absoluteTitle, ogType = "website" }: { path: string; title: string; description: string; absoluteTitle?: boolean; ogType?: "website" | "article" }): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} — CryptoScanner`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: ogType, url: path, title: fullTitle, description, locale: "pt_BR", siteName: "CryptoScanner", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: fullTitle, description },
  };
}

/** Ferramentas exigem conta: fora do índice de busca (os links internos continuam sendo seguidos). */
export const NOINDEX_METADATA: Metadata = { robots: { index: false, follow: true } };

/** Início (visitante e logado usam os mesmos metadados; a URL canônica é sempre "/"). */
export const HOME_METADATA: Metadata = publicPageMetadata({
  path: "/",
  title: "CryptoScanner — scanner cripto com sinais testados e alertas",
  absoluteTitle: true,
  description: "Padrões gráficos, sinais de rompimento testados fora da amostra, agentes com alertas, gráficos, Fibonacci, simulador e aulas. Teste grátis de 3 dias no PRO.",
});
