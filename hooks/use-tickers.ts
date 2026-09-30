"use client";

import * as React from "react";
import useSWR from "swr";
import type { Ticker } from "@/types/market";

export interface TickersPayload {
  tickers: Ticker[];
  source: string;
  stale: boolean;
  fetchedAt: number;
  usdBrl: number | null;
}

/**
 * Stream de tickers compartilhado: UMA conexão SSE por aba, com contagem de assinantes
 * (antes cada componente abria a sua). Polling SWR de 10 s só enquanto o SSE não está conectado.
 * Nada abre durante o carregamento da página: o stream (e o polling) só começam quando o navegador fica ocioso
 * ou na primeira interação, o que vier antes. Assim as páginas públicas pintam sem a conexão na cadeia crítica.
 */
type Snapshot = { payload: TickersPayload | null; connected: boolean; ready: boolean };
let snap: Snapshot = { payload: null, connected: false, ready: false };
const listeners = new Set<() => void>();
let es: EventSource | null = null;
let subscribers = 0;

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  for (const l of listeners) l();
}

function open() {
  if (es || typeof window === "undefined" || !("EventSource" in window)) return;
  es = new EventSource("/api/stream/tickers");
  es.addEventListener("tickers", (ev) => {
    try {
      emit({ payload: JSON.parse((ev as MessageEvent).data) as TickersPayload, connected: true });
    } catch {
      /* mensagem inválida: ignora */
    }
  });
  es.onerror = () => emit({ connected: false });
}

let readyScheduled = false;
const READY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

/** Marca "pronto" no primeiro ócio do navegador (máx. 4 s) ou na primeira interação. */
function scheduleReady() {
  if (readyScheduled || snap.ready || typeof window === "undefined") return;
  readyScheduled = true;
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const go = () => {
    for (const e of READY_EVENTS) window.removeEventListener(e, go);
    if (idleId !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    if (timer) clearTimeout(timer);
    if (snap.ready) return;
    emit({ ready: true });
    if (subscribers > 0) open();
  };
  for (const e of READY_EVENTS) window.addEventListener(e, go, { once: true, passive: true });
  if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(go, { timeout: 4000 });
  else timer = setTimeout(go, 2500);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  subscribers++;
  if (snap.ready) open();
  else scheduleReady();
  return () => {
    listeners.delete(cb);
    subscribers--;
    if (subscribers <= 0 && es) {
      es.close();
      es = null;
      snap = { ...snap, connected: false };
    }
  };
}

const getSnap = () => snap;
const SERVER_SNAP: Snapshot = { payload: null, connected: false, ready: false };
const getServerSnap = (): Snapshot => SERVER_SNAP;

export function useTickers(enabled = true) {
  const s = React.useSyncExternalStore(enabled ? subscribe : () => () => undefined, getSnap, getServerSnap);
  const { data: polled, mutate } = useSWR<TickersPayload>(enabled && s.ready ? "/api/market/tickers?fx=1" : null, { refreshInterval: s.connected ? 0 : 10_000 });
  const data = (s.connected ? s.payload : null) ?? polled ?? s.payload ?? null;
  const bySymbol = React.useMemo(() => new Map((data?.tickers ?? []).map((t) => [t.symbol, t])), [data]);
  return { data, bySymbol, connected: s.connected, refresh: mutate };
}
