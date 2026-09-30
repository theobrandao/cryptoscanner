import { connection } from "next/server";
import { okPrivate, requireAdmin, withApi } from "@/lib/api";
import { getAdminOverview } from "@/services/admin-service";

/** Painel do dono (somente ADMIN). */
export const GET = withApi(async (req) => {
  await connection();
  await requireAdmin(req);
  return okPrivate(await getAdminOverview());
});
