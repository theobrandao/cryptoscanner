import * as React from "react";
import { Badge } from "@/components/ui/badge";

/*
 * Identidade de plano (design system → plans / color_system.elite / color_system.pro), sobre os tokens de app/globals.css.
 * PRO: azul/violeta. ELITE: dourado só em borda, selo, CTA e pequenos detalhes (< 10% da composição).
 * Só cores: tamanho e raio ficam com quem usa (evita conflito de altura ao combinar com classes de layout).
 */
export const ELITE_TEXT = "text-elite-text";
export const ELITE_BORDER = "border-[color:var(--elite-border)]";
export const ELITE_SOFT_BG = "bg-[var(--elite-bg)]";
/** CTA do ELITE: contorno dourado discreto (mesmas cores do Button variant="elite"). */
export const ELITE_CTA = "border border-[color:var(--elite-border)] bg-transparent text-elite-text hover:border-elite hover:bg-[var(--elite-bg)] cursor-pointer";
/** CTA premium (Upgrade / Ativar PRO / Testar PRO): gradiente azul → violeta (mesmas cores do Button variant="premium"). */
export const PREMIUM_CTA = "bg-[linear-gradient(135deg,#2563eb,#7c3aed)] text-white hover:brightness-[1.08] cursor-pointer";

export function EliteBadge({ children = "ELITE", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <Badge variant="elite" className={className}>
      {children}
    </Badge>
  );
}

export function ProBadge({ children = "PRO", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <Badge variant="pro" className={className}>
      {children}
    </Badge>
  );
}
