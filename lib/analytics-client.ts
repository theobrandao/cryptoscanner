"use client";

/** Evento de produto (best-effort; nunca bloqueia a interface). */
export function trackClient(name: "dashboard_view" | "context_change" | "analyst_open" | "plans_view" | "onboarding_step" | "strategy_scan", props?: Record<string, string | number | boolean | null>) {
  try {
    let anonId: string | undefined;
    try {
      anonId = window.localStorage.getItem("cs-anon") ?? undefined;
      if (!anonId) {
        anonId = crypto.randomUUID().slice(0, 36);
        window.localStorage.setItem("cs-anon", anonId);
      }
    } catch {
      /* armazenamento indisponível */
    }
    void fetch("/api/analytics/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, anonId, props }), keepalive: true }).catch(() => undefined);
  } catch {
    /* ignora */
  }
}
