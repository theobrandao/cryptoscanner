import type * as React from "react";
import { LogoSymbol } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import styles from "@/components/brand/brand-loader.module.css";

/**
 * Indicador de carregamento da marca: símbolo CryptoScanner com uma linha de varredura sutil (2,8 s), no lugar de spinner genérico.
 * role="status" com texto para leitores de tela; com "reduzir movimento" o símbolo fica parado.
 */
export function BrandLoader({ size = 40, label = "Carregando…", showLabel = false, className }: { size?: number; label?: string; showLabel?: boolean; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center gap-3", className)}>
      <span className={styles.frame} style={{ width: size, height: size, "--scan-distance": `${size - 2}px` } as React.CSSProperties}>
        <LogoSymbol size={size} priority className={styles.symbol} />
        <span className={styles.line} aria-hidden />
      </span>
      <span className={showLabel ? "text-[12px] font-medium text-muted-foreground" : "sr-only"}>{label}</span>
    </div>
  );
}
