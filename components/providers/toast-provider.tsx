"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "success" | "danger" | "warning";
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(1);
  const remove = React.useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const toast = React.useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = idRef.current++;
      setItems((prev) => [...prev.slice(-4), { ...t, id }]);
      setTimeout(() => remove(id), 5000);
    },
    [remove],
  );
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-sm shadow-lg",
              t.variant === "success" && "border-success/50",
              t.variant === "danger" && "border-danger/50",
              t.variant === "warning" && "border-warning/50",
              (!t.variant || t.variant === "default") && "border-border",
            )}
            role="status"
          >
            <div className="flex-1">
              <div className="font-medium">{t.title}</div>
              {t.description ? <div className="text-xs text-muted-foreground">{t.description}</div> : null}
            </div>
            <button className="opacity-60 hover:opacity-100 cursor-pointer" onClick={() => remove(t.id)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx;
}
