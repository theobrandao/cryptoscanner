"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Avisos temporários (design system: canto superior direito, 4–6 s, tipos success/warning/error/info).
 * Cada tipo tem ícone próprio além da cor, para não depender só da cor. "danger" é sinônimo de "error"
 * e "default" de "info" (compatibilidade com as chamadas existentes).
 */
export type ToastVariant = "default" | "info" | "success" | "warning" | "error" | "danger";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** tempo na tela em ms (padrão 5000) */
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONES = {
  info: { icon: Info, border: "border-info/40", text: "text-info-text" },
  success: { icon: CheckCircle2, border: "border-success/40", text: "text-success-text" },
  warning: { icon: AlertTriangle, border: "border-warning/40", text: "text-warning-text" },
  error: { icon: XCircle, border: "border-danger/40", text: "text-danger-text" },
} as const;

function toneOf(v: ToastVariant | undefined) {
  if (v === "danger" || v === "error") return TONES.error;
  if (v === "success" || v === "warning") return TONES[v];
  return TONES.info;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(1);
  const remove = React.useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const toast = React.useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = idRef.current++;
      setItems((prev) => [...prev.slice(-4), { ...t, id }]);
      setTimeout(() => remove(id), t.duration ?? 5000);
    },
    [remove],
  );
  const value = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-(--z-toast) flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const tone = toneOf(t.variant);
          const Icon = tone.icon;
          const isError = t.variant === "error" || t.variant === "danger";
          return (
            <div key={t.id} className={cn("cs-pop-in pointer-events-auto flex items-start gap-3 rounded-lg border bg-elevated px-3 py-2.5 text-sm shadow-(--card-shadow)", tone.border)} role={isError ? "alert" : "status"}>
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.text)} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.title}</div>
                {t.description ? <div className="text-xs text-muted-foreground">{t.description}</div> : null}
              </div>
              <button className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground cursor-pointer" onClick={() => remove(t.id)} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx;
}
