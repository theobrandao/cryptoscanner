import type * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo oficial (design system → logo): símbolo C com três candlesticks. Arquivos em public/brand/, todos quadrados
 * (512 e 96 px, fundo transparente, mesma área útil), então o símbolo nunca é esticado: largura = altura = size.
 * Variantes exigidas pelo DS: gradient (original), branca, preta, monocromática azul (#1687FF) e monocromática clara (#CBD5E1).
 */
export type LogoVariant = "gradient" | "white" | "black" | "mono-blue" | "mono-light";

const FILE: Record<LogoVariant, string> = { gradient: "logo", white: "logo-white", black: "logo-black", "mono-blue": "logo-mono-blue", "mono-light": "logo-mono-light" };

/** Caminho do PNG certo para o tamanho de exibição: 96 px cobre até 48 px em telas 2x; acima disso, 512 px. */
export function logoSrc(variant: LogoVariant = "gradient", size = 32) {
  return `/brand/${FILE[variant]}${size <= 48 ? "-96" : ""}.png`;
}

interface LogoSymbolProps {
  /** Lado em px (o símbolo é quadrado). */
  size?: number;
  variant?: LogoVariant;
  /** Vazio (padrão) quando decorativo, isto é, quando o nome CryptoScanner já está visível ou no rótulo do link. */
  alt?: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function LogoSymbol({ size = 32, variant = "gradient", alt = "", priority, className, style }: LogoSymbolProps) {
  return <Image src={logoSrc(variant, size)} alt={alt} width={size} height={size} priority={priority} draggable={false} className={cn("shrink-0 select-none", className)} style={{ width: size, height: size, ...style }} />;
}

interface LogoLockupProps extends Omit<LogoSymbolProps, "alt"> {
  /** Só o símbolo (ex.: barra lateral recolhida); o nome fica disponível para leitores de tela. */
  symbolOnly?: boolean;
}

/**
 * Lockup principal "[símbolo] CryptoScanner". O espaço entre símbolo e nome é a área de proteção do DS
 * (0,25× a largura do símbolo). Nome em Inter 600 com tracking negativo, proporcional ao símbolo.
 */
export function LogoLockup({ size = 32, variant = "gradient", priority, className, style, symbolOnly }: LogoLockupProps) {
  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: symbolOnly ? 0 : Math.round(size * 0.25), ...style }}>
      <LogoSymbol size={size} variant={variant} priority={priority} />
      <span className={symbolOnly ? "sr-only" : "whitespace-nowrap font-semibold leading-none tracking-[-0.025em] text-foreground"} style={symbolOnly ? undefined : { fontSize: Math.round(size * 0.53) }}>
        CryptoScanner
      </span>
    </span>
  );
}
