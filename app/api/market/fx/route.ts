import { connection } from "next/server";
import { ok, withApi } from "@/lib/api";
import { getUsdBrl } from "@/services/market/market-service";

export const GET = withApi(async () => {
  await connection();
  return ok(await getUsdBrl());
});
