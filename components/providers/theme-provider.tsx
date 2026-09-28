"use client";

import * as React from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "cs-theme";
const EVENT = "cs-theme-change";

function readTheme(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/**
 * O tema é aplicado ao <html> por um script inline antes da hidratação (sem flash).
 * Aqui lemos o DOM como fonte de verdade via useSyncExternalStore (servidor: "dark").
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);

  const setTheme = React.useCallback((t: Theme) => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignora */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme fora do ThemeProvider");
  return ctx;
}

/** Script inline para aplicar o tema antes da hidratação (evita flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.classList.remove("dark","light");document.documentElement.classList.add(t)}catch(e){document.documentElement.classList.add("dark")}})();`;
