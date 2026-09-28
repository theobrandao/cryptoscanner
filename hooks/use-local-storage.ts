"use client";

import * as React from "react";

/**
 * Estado persistido em localStorage via useSyncExternalStore:
 *  - no servidor e durante a hidratação usa o valor inicial (sem mismatch);
 *  - no cliente lê o valor salvo e sincroniza entre componentes e abas.
 */
const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, cb: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set?.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function notify(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}

const memoryFallback = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* armazenamento indisponível */
  }
  return memoryFallback.get(key) ?? null;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  // Captura o valor inicial uma única vez (identidade estável entre renders).
  const [initialValue] = React.useState(() => initial);
  const raw = React.useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => readRaw(key),
    () => null,
  );
  const value = React.useMemo<T>(() => {
    if (raw === null) return initialValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  }, [raw, initialValue]);
  const set = React.useCallback(
    (v: T | ((prev: T) => T)) => {
      let prev = initialValue;
      const currentRaw = readRaw(key);
      if (currentRaw !== null) {
        try {
          prev = JSON.parse(currentRaw) as T;
        } catch {
          /* mantém o inicial */
        }
      }
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      const serialized = JSON.stringify(next);
      memoryFallback.set(key, serialized);
      try {
        window.localStorage.setItem(key, serialized);
      } catch {
        /* armazenamento indisponível: fica só em memória */
      }
      notify(key);
    },
    [key, initialValue],
  );
  return [value, set];
}

export function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<string[]>("cs-favorites", []);
  const toggle = React.useCallback((symbol: string) => setFavorites((prev) => (prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol])), [setFavorites]);
  return { favorites, toggle, isFavorite: (s: string) => favorites.includes(s) };
}
