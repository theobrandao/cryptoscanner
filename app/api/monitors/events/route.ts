import { connection } from "next/server";
import { z } from "zod";
import { ok, parseQuery, requireUser, withApi } from "@/lib/api";
import { listEvents } from "@/services/monitor-service";

/** Notificações in-app do Market Monitor (sino da barra superior). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const q = parseQuery(req, z.object({ unread: z.enum(["0", "1"]).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }));
  return ok(await listEvents(user.id, { unread: q.unread === "1", limit: q.limit }));
});
