import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", {
  variants: {
    variant: {
      default: "border-transparent bg-primary/15 text-primary",
      muted: "border-border bg-muted text-muted-foreground",
      success: "border-transparent bg-success/15 text-success",
      danger: "border-transparent bg-danger/15 text-danger",
      warning: "border-transparent bg-warning/15 text-warning",
      accent: "border-transparent bg-accent/15 text-accent",
      outline: "border-border text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function DirectionBadge({ direction, className }: { direction: string; className?: string }) {
  const map: Record<string, { v: BadgeProps["variant"]; label: string }> = {
    bullish: { v: "success", label: "▲ Alta" },
    bearish: { v: "danger", label: "▼ Baixa" },
    neutral: { v: "muted", label: "↔ Neutro" },
    up: { v: "success", label: "▲" },
    down: { v: "danger", label: "▼" },
    flat: { v: "muted", label: "↔" },
  };
  const m = map[direction] ?? { v: "muted" as const, label: direction };
  return (
    <Badge variant={m.v} className={className}>
      {m.label}
    </Badge>
  );
}
