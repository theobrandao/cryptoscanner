/** Formatação para a interface (seguro para cliente e servidor). */

export function priceDecimals(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price >= 1000) return 2;
  if (price >= 1) return 3;
  if (price >= 0.1) return 4;
  if (price >= 0.01) return 5;
  return 6;
}

export function formatPrice(value: number | null | undefined, currency: "USD" | "BRL" = "USD", rate = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const v = currency === "BRL" ? value * rate : value;
  const decimals = priceDecimals(v);
  const formatted = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  return currency === "BRL" ? `R$ ${formatted}` : `$ ${formatted}`;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatPct(value: number | null | undefined, decimals = 2, signed = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(value));
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${signed ? sign : ""}${s}%`;
}

export function formatCompact(value: number | null | undefined, prefix = "$"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (abs >= div) return `${prefix}${(value / div).toFixed(2)}${suffix}`;
  }
  return `${prefix}${value.toFixed(0)}`;
}

export function formatDateTime(ts: number | string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export function formatTime(ts: number | string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(d);
}

export function timeAgo(ts: number | string | Date | null | undefined, now = Date.now()): string {
  if (!ts) return "—";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h atrás`;
  return `${Math.floor(h / 24)} d atrás`;
}

export const DIRECTION_LABEL: Record<string, string> = { bullish: "Alta", bearish: "Baixa", neutral: "Neutro" };
export const MOMENTUM_LABEL: Record<string, string> = { strong_up: "Forte ↑", up: "Positivo", flat: "Neutro", down: "Negativo", strong_down: "Forte ↓" };
export const RISK_LABEL: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", extreme: "Extremo", unknown: "—" };
