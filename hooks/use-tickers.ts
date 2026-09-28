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
 * Tickers em tempo real: tenta SSE (/api/stream/tickers) e cai para polling SWR a cada 10 s.
 */
export function useTickers(enabled = true) {
  const { data: polled, mutate } = useSWR<TickersPayload>(enabled ? "/api/market/tickers?fx=1" : null, { refreshInterval: 10_000 });
  const [live, setLive] = React.useState<TickersPayload | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("EventSource" in window)) return;
    const es = new EventSource("/api/stream/tickers");
    const onTickers = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as TickersPayload;
        setLive(payload);
        setConnected(true);
      } catch {
        /* ignora */
      }
    };
    es.addEventListener("tickers", onTickers);
    es.onerror = () => setConnected(false);
    return () => {
      es.removeEventListener("tickers", onTickers);
      es.close();
    };
  }, [enabled]);

  const data = live ?? polled ?? null;
  const bySymbol = React.useMemo(() => new Map((data?.tickers ?? []).map((t) => [t.symbol, t])), [data]);
  return { data, bySymbol, connected, refresh: mutate };
}
