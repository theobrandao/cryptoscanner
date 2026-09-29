import { getPrisma } from "@/database/client";
import { clientIp } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("access-log");

/** Marco Civil da Internet, art. 15: registros de acesso (IP + data/hora) por 6 meses, sob sigilo. */
export async function logAccess(req: Request, userId: string | null, event: "login" | "register" | "password_reset" | "account_deleted") {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.accessLog.create({ data: { userId, ip: clientIp(req).slice(0, 64), event } });
  } catch (err) {
    log.warn("registro de acesso não gravado", { error: (err as Error).message });
  }
}

/** Remove registros com mais de 190 dias (6 meses + margem). */
export async function purgeAccessLogs(): Promise<number> {
  const prisma = getPrisma();
  if (!prisma) return 0;
  const r = await prisma.accessLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 190 * 86_400_000) } } });
  return r.count;
}
