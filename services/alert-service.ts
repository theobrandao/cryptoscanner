import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/database/client";
import { isTelegramConfigured } from "@/lib/env";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { createLogger } from "@/lib/logger";
import { detectPatterns } from "@/lib/patterns/detect";
import { detectVolumeAnomaly } from "@/lib/scanner/volume";
import { getCandles, getTickers } from "@/services/market/market-service";
import { escapeHtml, sendTelegramMessage } from "@/services/telegram";
import type { Timeframe } from "@/types/market";

const log = createLogger("alerts");

/**
 * Alertas de preço/indicador/padrão/volume do usuário (entidade Alert).
 * Avaliados no ciclo do worker; quando disparam ficam inativos (one-shot) e registram
 * uma entrada no histórico do usuário (ScanHistoryEntry) e, opcionalmente, Telegram.
 */
export async function evaluateAlerts(): Promise<{ evaluated: number; triggered: number }> {
  const prisma = getPrisma();
  if (!prisma) return { evaluated: 0, triggered: 0 };
  const alerts = await prisma.alert.findMany({ where: { active: true }, include: { asset: true, user: { select: { id: true, telegramChatId: true } } } });
  if (alerts.length === 0) return { evaluated: 0, triggered: 0 };
  const { tickers } = await getTickers();
  const byS = new Map(tickers.map((t) => [t.symbol, t]));
  let triggered = 0;

  for (const a of alerts) {
    try {
      const symbol = a.asset.symbol;
      const t = byS.get(symbol);
      let fired = false;
      let message = "";
      let payload: Prisma.InputJsonValue = {};
      const tf = a.timeframe as Timeframe;
      switch (a.kind) {
        case "price_above":
          if (t && a.threshold !== null && t.price >= a.threshold) {
            fired = true;
            message = `${symbol} acima de ${a.threshold} (preço ${t.price})`;
            payload = { price: t.price, threshold: a.threshold };
          }
          break;
        case "price_below":
          if (t && a.threshold !== null && t.price <= a.threshold) {
            fired = true;
            message = `${symbol} abaixo de ${a.threshold} (preço ${t.price})`;
            payload = { price: t.price, threshold: a.threshold };
          }
          break;
        case "rsi_above":
        case "rsi_below": {
          const s = computeSnapshot((await getCandles(symbol, tf, { limit: 200 })).candles);
          if (a.threshold !== null && Number.isFinite(s.rsi14)) {
            if ((a.kind === "rsi_above" && s.rsi14 >= a.threshold) || (a.kind === "rsi_below" && s.rsi14 <= a.threshold)) {
              fired = true;
              message = `${symbol} RSI14 ${tf} em ${s.rsi14} (${a.kind === "rsi_above" ? "≥" : "≤"} ${a.threshold})`;
              payload = { rsi: s.rsi14, threshold: a.threshold };
            }
          }
          break;
        }
        case "pattern": {
          const ps = detectPatterns((await getCandles(symbol, tf, { limit: 300 })).candles, { minConfidence: a.threshold ?? 60 });
          const hit = a.pattern ? ps.find((p) => p.key === a.pattern) : ps[0];
          if (hit) {
            fired = true;
            message = `${symbol} ${tf}: ${hit.label} (confiança ${hit.confidence})`;
            payload = { pattern: hit.key, confidence: hit.confidence, target: hit.target, stop: hit.stop };
          }
          break;
        }
        case "volume": {
          const v = detectVolumeAnomaly(symbol, tf, (await getCandles(symbol, tf, { limit: 60 })).candles, { thresholdPct: a.threshold ?? 100 });
          if (v) {
            fired = true;
            message = `${symbol} ${tf}: volume +${v.increasePct}% sobre a média`;
            payload = { ...v };
          }
          break;
        }
        default:
          break;
      }
      if (!fired) continue;
      triggered++;
      await prisma.$transaction([
        prisma.alert.update({ where: { id: a.id }, data: { active: false, triggeredAt: new Date() } }),
        prisma.scanHistoryEntry.create({
          data: {
            userId: a.userId,
            symbol,
            timeframe: a.timeframe,
            kind: a.kind === "volume" ? "volume" : a.kind === "pattern" ? "pattern" : "alert",
            title: message,
            direction: "neutral",
            confidence: null,
            payload,
          },
        }),
      ]);
      if ((a.channel === "telegram" || a.channel === "both") && a.user.telegramChatId && isTelegramConfigured()) {
        await sendTelegramMessage(a.user.telegramChatId, `🔔 <b>Alerta</b>\n${escapeHtml(message)}`);
      }
    } catch (err) {
      log.warn("alerta falhou", { alertId: a.id, error: (err as Error).message });
    }
  }
  return { evaluated: alerts.length, triggered };
}
