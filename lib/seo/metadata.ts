import type { Metadata } from "next";
import { PAGE_SEO, type PageSeo } from "@/lib/seo/pages";

/** Imagem de compartilhamento gerada por app/opengraph-image.tsx (repetida aqui porque `openGraph` da página substitui o do layout). */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "CryptoScanner — padrões gráficos, sinais testados e alertas de cripto" };

type OgImage = { url: string; width?: number; height?: number; alt?: string };

/**
 * Metadados de página pública: título, descrição própria, canonical, idioma (pt-BR) e og:url no mesmo caminho.
 * `absoluteTitle` ignora o modelo "%s — CryptoScanner" do layout. `images`: imagem própria de compartilhamento
 * (ex.: capa do tutorial); `null` deixa a imagem para o arquivo opengraph-image do próprio segmento.
 */
export function publicPageMetadata({ path, title, description, absoluteTitle, ogType = "website", images }: PageSeo & { ogType?: "website" | "article"; images?: OgImage[] | null }): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} — CryptoScanner`;
  const ogImages = images === null ? undefined : (images ?? [OG_IMAGE]);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path, languages: { "pt-BR": path, "x-default": path } },
    openGraph: { type: ogType, url: path, title: fullTitle, description, locale: "pt_BR", siteName: "CryptoScanner", ...(ogImages ? { images: ogImages } : {}) },
    twitter: { card: "summary_large_image", title: fullTitle, description, ...(ogImages ? { images: ogImages.map((i) => i.url) } : {}) },
  };
}

/** Ferramentas exigem conta: fora do índice de busca (os links internos continuam sendo seguidos). */
export const NOINDEX_METADATA: Metadata = { robots: { index: false, follow: true } };

/** Início (visitante e logado usam os mesmos metadados; a URL canônica é sempre "/"). */
export const HOME_METADATA: Metadata = publicPageMetadata(PAGE_SEO.home);
