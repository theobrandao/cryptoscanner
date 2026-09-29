import { connection } from "next/server";
import { ApiError, ok, requireUser, withApi } from "@/lib/api";
import { getAdminOverview } from "@/services/admin-service";

/** Painel do dono (somente ADMIN). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new ApiError(403, "Acesso restrito ao administrador", "forbidden");
  return ok(await getAdminOverview());
});
