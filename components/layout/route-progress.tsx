"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Barra fina no topo durante a troca de página: começa no clique de um link interno e termina quando a
 * nova rota monta. Dá retorno imediato ao clique, mesmo quando a página seguinte demora a carregar.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      document.documentElement.dataset.nav = "1";
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // rota nova montou: completa a barra e some (ajuste de estado durante a renderização, sem efeito)
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (state === "loading") setState("done");
  }

  // segurança: se a rota nunca muda (navegação cancelada, mesmo endereço, erro), a barra some sozinha em 8 s
  React.useEffect(() => {
    if (state !== "loading") return;
    const t = setTimeout(() => setState("idle"), 8000);
    return () => clearTimeout(t);
  }, [state]);

  React.useEffect(() => {
    if (state !== "done") return;
    timer.current = setTimeout(() => setState("idle"), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-gradient-to-r from-primary to-accent shadow-[0_0_8px_var(--primary)] motion-reduce:transition-none!"
        style={{
          width: state === "idle" ? "0%" : state === "loading" ? "80%" : "100%",
          opacity: state === "idle" ? 0 : 1,
          transition: state === "loading" ? "width 2.5s cubic-bezier(.1,.7,.2,1), opacity .1s" : "width .2s ease-out, opacity .3s ease .15s",
        }}
      />
    </div>
  );
}
