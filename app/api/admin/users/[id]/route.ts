import { connection } from "next/server";
import { z } from "zod";
import { ok, parseBody, requireAdmin, withApi } from "@/lib/api";
import { deleteUser, getUserDetail } from "@/services/admin-users-service";

/** Detalhes de um usuário (somente ADMIN). */
export const GET = withApi(async (req, ctx) => {
  await connection();
  await requireAdmin(req);
  const { id } = await ctx.params;
  return ok(await getUserDetail(id as string));
});

/** Exclui a conta de um usuário. Exige digitar o e-mail da conta. */
export const DELETE = withApi(async (req, ctx) => {
  await connection();
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ confirmEmail: z.string().trim().min(3).max(200) }));
  await deleteUser(admin, id as string, body.confirmEmail, req);
  return ok({ deleted: true });
});
