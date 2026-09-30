import * as React from "react";
import { AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-md", className)} {...props} />;
}

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} {...props} />;
}

/** Barra de progresso; `label` dá nome à barra para leitores de tela e `valueText` troca o "N%" lido por um texto (ex.: "3 de 12 aulas"). */
export function Progress({ value, className, tone = "primary", label, valueText }: { value: number; className?: string; tone?: "primary" | "success" | "danger" | "warning"; label?: string; valueText?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const bg = { primary: "bg-primary", success: "bg-success", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label} aria-valuetext={valueText}>
      <div className={cn("h-full transition-[width] motion-reduce:transition-none", bg)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
  action,
}: {
  variant?: "info" | "warning" | "danger" | "success";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const styles = {
    info: "border-info/40 bg-info/10 text-foreground",
    warning: "border-warning/40 bg-warning/10 text-foreground",
    danger: "border-danger/40 bg-danger/10 text-foreground",
    success: "border-success/40 bg-success/10 text-foreground",
  }[variant];
  const Icon = { info: Info, warning: AlertTriangle, danger: XCircle, success: CheckCircle2 }[variant];
  const iconTone = { info: "text-info-text", warning: "text-warning-text", danger: "text-danger-text", success: "text-success-text" }[variant];
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-start", styles, className)} role="status">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconTone)} aria-hidden />
        <div className="min-w-0 flex-1">
          {title ? <div className="font-semibold">{title}</div> : null}
          {children ? <div className="text-muted-foreground">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 sm:self-center">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      {icon ? <div className="mb-1 grid h-11 w-11 place-items-center rounded-lg border border-border bg-elevated text-2xl text-muted-foreground [&>svg]:h-5 [&>svg]:w-5">{icon}</div> : null}
      <div className="font-semibold">{title}</div>
      {description ? <div className="max-w-md text-sm text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" | "muted" }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular", tone === "up" && "text-success", tone === "down" && "text-danger", tone === "muted" && "text-muted-foreground")}>{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
