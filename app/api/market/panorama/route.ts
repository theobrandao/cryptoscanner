import { connection } from "next/server";
import { enforceRateLimit, ok, withApi } from "@/lib/api";
import { getPanoramaReport } from "@/services/panorama-service";

/**
 * Panorama diário: relatório executivo determinístico (BTC 1D, ciclo, Medo & Ganância, mercado global,
 * derivativos e manchetes) com fatores rotulados e fonte de cada dado. Cache de 5 min.
 */
export const GET = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const { report, stale } = await getPanoramaReport();
  return ok({ ...report, stale });
});
