"use client";

import * as React from "react";
import { isInstrument, isVenue, type Instrument, type Venue } from "@/lib/venues";
import type { Timeframe } from "@/types/market";

/**
 * Contexto global de mercado (cliente): ativo × exchange × instrumento × timeframe.
 * A URL é a fonte da verdade da página; este store guarda a ÚLTIMA seleção ativa para os componentes
 * globais (AI Analyst na barra superior, busca) e para restaurar o Dashboard. `version` incrementa a cada
 * troca: respostas de uma versão anterior são descartadas pelo consumidor.
 */
export interface MarketSelection {
  symbol: string;
  timeframe: Timeframe;
  exchange: Venue;
  instrument: Instrument;
}

export const SELECTION_TFS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
export const DEFAULT_SELECTION: MarketSelection = { symbol: "BTC", timeframe: "4h", exchange: "binance", instrument: "perp" };
const KEY = "cs-selection-v1";

export const selectionKey = (s: MarketSelection) => `${s.exchange}:${s.instrument}:${s.symbol}:${s.timeframe}`;

type State = { selection: MarketSelection; version: number };
let state: State | null = null;
const listeners = new Set<() => void>();

function load(): State {
  if (state) return state;
  let sel = DEFAULT_SELECTION;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as Partial<MarketSelection>;
      sel = {
        symbol: typeof p.symbol === "string" ? p.symbol : DEFAULT_SELECTION.symbol,
        timeframe: SELECTION_TFS.includes(p.timeframe as Timeframe) ? (p.timeframe as Timeframe) : DEFAULT_SELECTION.timeframe,
        exchange: isVenue(p.exchange) ? p.exchange : DEFAULT_SELECTION.exchange,
        instrument: isInstrument(p.instrument) ? p.instrument : DEFAULT_SELECTION.instrument,
      };
    }
  } catch {
    /* storage indisponível: usa o padrão */
  }
  state = { selection: sel, version: 0 };
  return state;
}

export function setActiveSelection(sel: MarketSelection) {
  const cur = load();
  if (selectionKey(cur.selection) === selectionKey(sel)) return;
  state = { selection: sel, version: cur.version + 1 };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sel));
  } catch {
    /* ignora */
  }
  for (const l of listeners) l();
}

const SERVER: State = { selection: DEFAULT_SELECTION, version: 0 };

export function useActiveSelection(): State {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load,
    () => SERVER,
  );
}

/** Lê a seleção dos parâmetros da URL, completando com a última seleção salva. */
export function selectionFromParams(params: URLSearchParams, fallback: MarketSelection, symbolOverride?: string): MarketSelection {
  const tf = params.get("tf") as Timeframe | null;
  const ex = params.get("exchange");
  const inst = params.get("instrument");
  return {
    symbol: (symbolOverride ?? params.get("symbol") ?? fallback.symbol).toUpperCase(),
    timeframe: tf && SELECTION_TFS.includes(tf) ? tf : fallback.timeframe,
    exchange: isVenue(ex) ? ex : fallback.exchange,
    instrument: isInstrument(inst) ? inst : fallback.instrument,
  };
}
