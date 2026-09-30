import { connection, NextResponse } from "next/server";
import { enforceRateLimit, parseQuery, requireAdmin, withApi } from "@/lib/api";
import { exportUsersCsv } from "@/services/admin-users-service";
import { adminUsersQuerySchema } from "@/lib/validation/admin";

/** CSV (Excel pt-BR: UTF-8 com BOM, separador ";") da lista filtrada, todas as páginas. */
export const GET = withApi(async (req) => {
  await connection();
  const admin = await requireAdmin(req);
  await enforceRateLimit(req, "admin_export", `u:${admin.id}`);
  const q = parseQuery(req, adminUsersQuerySchema);
  const csv = await exportUsersCsv(q);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="usuarios-${day}.csv"`, "cache-control": "no-store" } });
});
