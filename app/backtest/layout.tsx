import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NOINDEX_METADATA } from "@/lib/seo/metadata";

/** Ferramenta que exige conta: fora do índice de busca. */
export const metadata: Metadata = NOINDEX_METADATA;

export default function ToolLayout({ children }: { children: ReactNode }) {
  return children;
}
