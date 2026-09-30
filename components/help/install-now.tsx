"use client";

import * as React from "react";
import { CircleCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type PromptEvent = Event & { prompt?: () => Promise<void> };
type W = Window & { __csInstallPrompt?: PromptEvent };

/** Mesmo evento usado por components/providers/pwa-register.tsx: o navegador ofereceu a instalação. */
function subscribe(cb: () => void) {
  window.addEventListener("cs:installprompt", cb);
  window.addEventListener("appinstalled", cb);
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", cb);
  return () => {
    window.removeEventListener("cs:installprompt", cb);
    window.removeEventListener("appinstalled", cb);
    mq?.removeEventListener?.("change", cb);
  };
}

function snapshot(): "installed" | "available" | "none" {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "installed";
  return (window as W).__csInstallPrompt ? "available" : "none";
}

/**
 * Atalho de instalação na página do tutorial: aparece só quando o navegador permite instalar direto (Chrome/Edge/Android)
 * ou avisa que o app já está aberto como instalado. Nos demais casos não mostra nada (o passo a passo cobre).
 */
export function InstallNow() {
  const [used, setUsed] = React.useState(false);
  const state = React.useSyncExternalStore(subscribe, snapshot, () => "none" as const);
  if (state === "installed")
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm" role="status">
        <CircleCheck className="h-4 w-4 shrink-0 text-info" aria-hidden /> Você já está usando o app instalado neste aparelho.
      </p>
    );
  if (state !== "available" || used) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm">Seu navegador permite instalar direto por aqui.</p>
      <Button
        onClick={() => {
          const ev = (window as W).__csInstallPrompt;
          void ev?.prompt?.();
          (window as W).__csInstallPrompt = undefined;
          setUsed(true);
        }}
      >
        <Download className="h-4 w-4" aria-hidden /> Instalar app
      </Button>
    </div>
  );
}
