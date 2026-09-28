import { PrismaClient } from "@prisma/client";
import { isDatabaseConfigured } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("db");

declare global {
  var __cryptoscannerPrisma: PrismaClient | undefined;
}

/**
 * Cliente Prisma singleton (evita múltiplas conexões no hot reload do Next.js).
 * Retorna null quando DATABASE_URL não está configurado — os recursos que dependem do
 * banco respondem 503 com mensagem clara em vez de quebrar a navegação pública.
 */
export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured()) return null;
  if (!globalThis.__cryptoscannerPrisma) {
    globalThis.__cryptoscannerPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    log.info("prisma inicializado");
  }
  return globalThis.__cryptoscannerPrisma;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Banco de dados não configurado (DATABASE_URL). Recurso indisponível.");
    this.name = "DatabaseUnavailableError";
  }
}

export function requirePrisma(): PrismaClient {
  const p = getPrisma();
  if (!p) throw new DatabaseUnavailableError();
  return p;
}

/** Verificação leve de conectividade para /api/health. */
export async function checkDatabase(): Promise<{ configured: boolean; ok: boolean; error?: string }> {
  const p = getPrisma();
  if (!p) return { configured: false, ok: false };
  try {
    await p.$queryRaw`SELECT 1`;
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: (err as Error).message };
  }
}
