import { connection } from "next/server";
import { z } from "zod";
import { ok, parseQuery, requireAdmin, withApi } from "@/lib/api";
import { listAudit } from "@/services/admin-users-service";

/** Registro de ações do administrador (paginado). */
export const GET = withApi(async (req) => {
  await connection();
  await requireAdmin(req);
  const { page } = parseQuery(req, z.object({ page: z.coerce.number().int().min(1).max(10_000).optional() }));
  return ok(await listAudit(page ?? 1));
});
