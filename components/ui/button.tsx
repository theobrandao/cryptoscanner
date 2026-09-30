import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botões do design system. primary/default = CTA principal (degradê azul, texto branco AA); premium = upgrade/ativar PRO
 * (azul → violeta); elite = ações do plano ELITE (borda e texto dourados, nunca fundo dourado); danger usa vermelho mais
 * escuro (#dc2626) porque branco sobre #ef4444 fica abaixo de 4,5:1. Alturas 32/36/40 px, raio 8 px.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,filter,box-shadow] duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(135deg,#1466d8,#2563eb)] text-white hover:brightness-[1.08]",
        primary: "bg-[linear-gradient(135deg,#1466d8,#2563eb)] text-white hover:brightness-[1.08]",
        secondary: "border border-[color:var(--secondary-border)] bg-secondary text-secondary-foreground hover:border-border-hover hover:bg-surface-hover hover:text-foreground",
        premium: "bg-[linear-gradient(135deg,#2563eb,#7c3aed)] text-white hover:brightness-[1.08]",
        elite: "border border-[color:var(--elite-border)] bg-transparent text-elite-text hover:border-elite hover:bg-[var(--elite-bg)]",
        outline: "border border-border bg-transparent hover:border-border-hover hover:bg-surface-hover",
        ghost: "hover:bg-surface-hover",
        danger: "bg-danger-strong text-white hover:bg-[#b91c1c]",
        accent: "bg-accent text-accent-foreground hover:brightness-[1.08]",
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
