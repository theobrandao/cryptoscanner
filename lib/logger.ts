/**
 * Logger estruturado mínimo (JSON em produção, legível em desenvolvimento).
 * Sem dependência externa para funcionar tanto no Next.js quanto no worker.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(scope: string, level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  const payload: Record<string, unknown> = { ts: new Date().toISOString(), level, scope, msg };
  if (data) {
    for (const [k, v] of Object.entries(data)) payload[k] = serializeError(v);
  }
  const line = process.env.NODE_ENV === "production" ? JSON.stringify(payload) : formatDev(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function formatDev(p: Record<string, unknown>): string {
  const { ts, level, scope, msg, ...rest } = p;
  const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
  return `${String(ts).slice(11, 19)} ${String(level).toUpperCase().padEnd(5)} [${String(scope)}] ${String(msg)}${extra}`;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, d) => emit(scope, "debug", m, d),
    info: (m, d) => emit(scope, "info", m, d),
    warn: (m, d) => emit(scope, "warn", m, d),
    error: (m, d) => emit(scope, "error", m, d),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

export const logger = createLogger("app");
