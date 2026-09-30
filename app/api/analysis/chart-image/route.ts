import { connection } from "next/server";
import { ApiError, enforceRateLimit, ok, withApi } from "@/lib/api";
import { ALLOWED_MIME, analyzeChartImage, ChartAnalysisUnavailableError, MAX_IMAGE_BYTES, QuotaExceededError, type AllowedMime } from "@/services/chart-image-service";
import { requireCoreUser } from "@/services/subscription-service";

/**
 * Análise de gráfico por IA (imagem). multipart/form-data: file (JPG/PNG/WebP ≤ 5 MB), symbol?, timeframe?
 * Requer login (comportamento observado na referência) e provedor LLM com visão configurado.
 */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  await enforceRateLimit(req, "llm", user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Envie multipart/form-data com o campo 'file'", "invalid_form");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Campo 'file' obrigatório", "missing_file");
  if (!ALLOWED_MIME.includes(file.type as AllowedMime)) throw new ApiError(415, "Formato inválido. Use JPG, PNG ou WebP.", "unsupported_media");
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(413, "Imagem acima de 5 MB", "too_large");
  const bytes = Buffer.from(await file.arrayBuffer());
  const symbol = typeof form.get("symbol") === "string" ? String(form.get("symbol")).slice(0, 12) : undefined;
  const timeframe = typeof form.get("timeframe") === "string" ? String(form.get("timeframe")).slice(0, 4) : undefined;
  try {
    const res = await analyzeChartImage({ userId: user.id, plan: user.plan, bytes, mime: file.type as AllowedMime, hint: { symbol, timeframe }, signal: req.signal });
    return ok(res);
  } catch (err) {
    if (err instanceof ChartAnalysisUnavailableError) throw new ApiError(503, err.message, "llm_unavailable");
    if (err instanceof QuotaExceededError) throw new ApiError(402, err.message, "quota_exceeded");
    throw err;
  }
});
