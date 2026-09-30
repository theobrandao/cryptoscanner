import { connection } from "next/server";
import { ok, parseQuery, requireAdmin, withApi } from "@/lib/api";
import { adminUsersQuerySchema } from "@/lib/validation/admin";
import { listUsers } from "@/services/admin-users-service";

/** Painel de controle: lista de usuários (somente ADMIN). */
export const GET = withApi(async (req) => {
  await connection();
  await requireAdmin(req);
  const q = parseQuery(req, adminUsersQuerySchema);
  return ok(await listUsers({ ...q, pageSize: 25 }));
});
