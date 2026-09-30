import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Carregamento de página (DS → motion.loading): símbolo CryptoScanner com varredura sutil, no lugar de esqueleto genérico.
 * Ocupa a altura da tela: o rodapé não aparece acima da dobra e não "pula" quando o conteúdo chega.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[100svh] justify-center pt-[22svh]" aria-busy="true">
      <BrandLoader size={44} label="Carregando página…" />
    </div>
  );
}
