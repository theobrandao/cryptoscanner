import { connection } from "next/server";
import { z } from "zod";
import { ok, parseBody, requireAdmin, withApi } from "@/lib/api";
import { blockUser, endSessions, extendTrial, grantAccess, revokeAccess, sendPasswordReset, unblockUser } from "@/services/admin-users-service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), plan: z.enum(["PRO", "ELITE"]), days: z.number().int().min(1).max(3650).nullable() }),
  z.object({ action: z.literal("extend_trial"), days: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("block"), reason: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("end_sessions") }),
  z.object({ action: z.literal("password_reset") }),
]);

/** Ações do administrador sobre uma conta (todas registradas no histórico de ações). */
export const POST = withApi(async (req, ctx) => {
  await connection();
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const userId = id as string;
  const body = await parseBody(req, bodySchema);
  switch (body.action) {
    case "grant":
      await grantAccess(admin, userId, body.plan, body.days);
      break;
    case "extend_trial":
      await extendTrial(admin, userId, body.days);
      break;
    case "revoke":
      await revokeAccess(admin, userId);
      break;
    case "block":
      await blockUser(admin, userId, body.reason);
      break;
    case "unblock":
      await unblockUser(admin, userId);
      break;
    case "end_sessions":
      await endSessions(admin, userId);
      break;
    case "password_reset":
      return ok({ done: true, ...(await sendPasswordReset(admin, userId)) });
  }
  return ok({ done: true });
});
