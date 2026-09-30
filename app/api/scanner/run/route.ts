import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { ApiError, enforceRateLimit, ok, parseBody, withApi } from "@/lib/api";
import { getPrisma } from "@/database/client";
import { planAllowsTimeframe } from "@/lib/plans";
import { parseTimeframe } from "@/lib/timeframes";
import { runScan } from "@/services/scanner-service";
import { requireCoreUser } from "@/services/subscription-service";

const bodySchema = z.object({
  timeframe: z.string().default("4h"),
  direction: z.enum(["all", "bullish", "bearish"]).default("all"),
  symbols: z.array(symbolSchema).min(1).max(50).optional(),
  minConfidence: z.number().min(0).max(100).default(60),
  includeVolume: z.boolean().default(true),
  refresh: z.boolean().default(false),
});

/** "Escanear Agora": detecta padrões e volume anômalo; grava o histórico do usuário logado. */
export const POST = withApi(async (req) => {
  await connection();
  await enforceRateLimit(req, "public");
  const body = await parseBody(req, bodySchema);
  const tf = parseTimeframe(body.timeframe);
  const user = await requireCoreUser(req);
  if (!planAllowsTimeframe(user?.plan, tf)) throw new ApiError(403, `Timeframe ${tf.toUpperCase()} disponível apenas no plano PLATINUM`, "plan_required");
  const res = await runScan({ timeframe: tf, direction: body.direction, symbols: body.symbols, minConfidence: body.minConfidence, includeVolume: body.includeVolume, refresh: body.refresh });

  const prisma = getPrisma();
  if (user && prisma && !res.cached) {
    const entries = [
      ...res.rows.flatMap((r) =>
        r.patterns.map((p) => ({
          userId: user.id,
          symbol: r.symbol,
          timeframe: tf,
          kind: "pattern",
          title: `${p.label} em ${r.symbol}`,
          direction: p.direction,
          confidence: p.confidence,
          payload: { key: p.key, price: p.price, target: p.target, stop: p.stop, summary: p.summary },
        })),
      ),
      ...res.volumeAlerts.map((v) => ({
        userId: user.id,
        symbol: v.symbol,
        timeframe: v.timeframe,
        kind: "volume",
        title: `Volume +${v.increasePct}% em ${v.symbol} (${v.timeframe.toUpperCase()})`,
        direction: v.direction === "up" ? "bullish" : v.direction === "down" ? "bearish" : "neutral",
        confidence: null,
        payload: { ...v },
      })),
    ];
    if (entries.length) await prisma.scanHistoryEntry.createMany({ data: entries }).catch(() => undefined);
  }
  return ok(JSON.parse(JSON.stringify(res, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v))));
});
