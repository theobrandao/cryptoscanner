"use client";

import * as React from "react";

/** Registra o service worker (instalação como app) e expõe o prompt de instalação via evento `cs:installprompt`. */
export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __csInstallPrompt?: Event }).__csInstallPrompt = e;
      window.dispatchEvent(new CustomEvent("cs:installprompt"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

/** Botão "Instalar app" que aparece só quando o navegador oferece a instalação. */
export function InstallButton({ className }: { className?: string }) {
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    const check = () => setAvailable(Boolean((window as unknown as { __csInstallPrompt?: Event }).__csInstallPrompt));
    check();
    window.addEventListener("cs:installprompt", check);
    return () => window.removeEventListener("cs:installprompt", check);
  }, []);
  if (!available) return null;
  return (
    <button
      className={className}
      onClick={() => {
        const ev = (window as unknown as { __csInstallPrompt?: Event & { prompt?: () => Promise<void> } }).__csInstallPrompt;
        void ev?.prompt?.();
        (window as unknown as { __csInstallPrompt?: Event }).__csInstallPrompt = undefined;
        setAvailable(false);
      }}
      aria-label="Instalar aplicativo"
    >
      ⬇️ Instalar app
    </button>
  );
}
