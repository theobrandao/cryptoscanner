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
 */
type Snapshot = { payload: TickersPayload | null; connected: boolean };
let snap: Snapshot = { payload: null, connected: false };
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

function subscribe(cb: () => void) {
  listeners.add(cb);
  subscribers++;
  open();
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
const getServerSnap = (): Snapshot => ({ payload: null, connected: false });

export function useTickers(enabled = true) {
  const s = React.useSyncExternalStore(enabled ? subscribe : () => () => undefined, getSnap, getServerSnap);
  const { data: polled, mutate } = useSWR<TickersPayload>(enabled ? "/api/market/tickers?fx=1" : null, { refreshInterval: s.connected ? 0 : 10_000 });
  const data = (s.connected ? s.payload : null) ?? polled ?? s.payload ?? null;
  const bySymbol = React.useMemo(() => new Map((data?.tickers ?? []).map((t) => [t.symbol, t])), [data]);
  return { data, bySymbol, connected: s.connected, refresh: mutate };
}
