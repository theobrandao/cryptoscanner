import { connection } from "next/server";
import { z } from "zod";
import { ok, parseBody, requireUser, withApi } from "@/lib/api";
import { markRead } from "@/services/monitor-service";

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const b = await parseBody(req, z.object({ ids: z.array(z.string().max(40)).max(100).optional() }));
  return ok(await markRead(user.id, b.ids));
});
