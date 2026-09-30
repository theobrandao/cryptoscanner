"use client";

import type { ClientAnalyticsName } from "@/services/analytics-service";

/**
 * Evento de produto (best-effort; nunca bloqueia a interface). Nomes e propriedades aceitas: services/analytics-service.ts
 * (cta_click {origin}, signup_view, gate_view {feature}, trial_card_click, onboarding_step {step}, cancel_reason {reason}).
 */
export function trackClient(name: ClientAnalyticsName, props?: Record<string, string | number | boolean | null>) {
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
