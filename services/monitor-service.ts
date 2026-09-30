import { createHash } from "node:crypto";
import { requirePrisma } from "@/database/client";
import { ApiError } from "@/lib/api";
import { getAsset } from "@/lib/assets";
import { createLogger } from "@/lib/logger";
import { INSTRUMENT_LABEL, VENUE_LABEL, type Instrument, type Venue } from "@/lib/venues";
import { definitionSchema } from "@/lib/strategies/definition";
import { formatPrice } from "@/lib/format";
import { directionPt, pt, SCORE_LABEL_PT, SETUP_STATE_PT } from "@/lib/display-labels";
import { getMarketContext, type MarketContext } from "@/services/market-context-service";
import { evaluateLive } from "@/services/strategy-service";
import { sendPushToUser } from "@/services/push-service";
import { escapeHtml, sendTelegramMessage } from "@/services/telegram";
import { track } from "@/services/analytics-service";
import type { AccessView } from "@/services/subscription-service";
import { ENTITLEMENTS, tierFor } from "@/lib/entitlements";
import type { Timeframe } from "@/types/market";

const log = createLogger("monitor");

/**
 * Market Monitor — avaliado no SERVIDOR a cada ciclo do cron (não depende do navegador aberto).
 *
 * Alert engine: cada fato gera uma impressão digital (fingerprint) determinística; MonitorEvent.fingerprint é
 * único no banco, então o mesmo fato nunca notifica duas vezes (reexecução do ciclo, corrida entre instâncias,
 * setup oscilando READY → FORMING → READY na mesma zona).
 *   SETUP:    monitor | estado | direção | zona de entrada (6 dígitos) | candle do gatilho
 *   STRATEGY: monitor | candle fechado do timeframe de execução em que as condições passaram a valer
 */
export const MONITOR_STATES = ["FORMING", "READY", "TRIGGERED", "ACTIVE", "TARGET_HIT", "INVALIDATED", "EXPIRED"] as const;
/** estados de encerramento notificam mesmo com score abaixo do mínimo (quem acompanha precisa saber) */
const CLOSING = new Set(["TARGET_HIT", "INVALIDATED", "EXPIRED"]);

export interface MonitorInput {
  symbol: string;
  timeframe: Timeframe;
  exchange: Venue;
  instrument: Instrument;
  kind: "SETUP" | "STRATEGY";
  strategyId?: string | null;
  states?: string[];
  minScore?: number;
  notifyPush?: boolean;
  notifyTelegram?: boolean;
}

export async function listMonitors(userId: string) {
  return requirePrisma().monitor.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { strategy: { select: { id: true, name: true } } } });
}

export async function createMonitor(userId: string, access: AccessView, input: MonitorInput) {
  const prisma = requirePrisma();
  const asset = getAsset(input.symbol);
  if (!asset) throw new ApiError(400, `Ativo desconhecido: ${input.symbol}`, "validation");
  const count = await prisma.monitor.count({ where: { userId } });
  if (count >= access.entitlements.maxMonitors) throw new ApiError(403, `Limite de ${access.entitlements.maxMonitors} monitores no seu plano`, "monitor_limit");
  if (!access.entitlements.timeframes.includes(input.timeframe)) throw new ApiError(402, `Timeframe ${input.timeframe} não incluído no seu plano`, "timeframe_locked");
  if (input.kind === "STRATEGY") {
    if (!input.strategyId) throw new ApiError(400, "Escolha a estratégia", "validation");
    const s = await prisma.strategy.findFirst({ where: { id: input.strategyId, userId } });
    if (!s) throw new ApiError(404, "Estratégia não encontrada", "not_found");
  }
  const dup = await prisma.monitor.findFirst({
    where: { userId, symbol: asset.symbol, timeframe: input.timeframe, exchange: input.exchange, instrument: input.instrument, kind: input.kind, strategyId: input.kind === "STRATEGY" ? input.strategyId : null },
  });
  if (dup) throw new ApiError(409, "Já existe um monitor igual", "duplicate");
  return prisma.monitor.create({
    data: {
      userId,
      symbol: asset.symbol,
      timeframe: input.timeframe,
      exchange: input.exchange,
      instrument: input.instrument,
      kind: input.kind,
      strategyId: input.kind === "STRATEGY" ? input.strategyId : null,
      states: input.states?.length ? input.states : ["READY", "TRIGGERED", "INVALIDATED", "TARGET_HIT"],
      minScore: input.minScore ?? 60,
      notifyPush: input.notifyPush ?? true,
      notifyTelegram: input.notifyTelegram ?? false,
    },
  });
}

export async function updateMonitor(userId: string, id: string, data: { active?: boolean; states?: string[]; minScore?: number; notifyPush?: boolean; notifyTelegram?: boolean }) {
  const prisma = requirePrisma();
  const m = await prisma.monitor.findFirst({ where: { id, userId } });
  if (!m) throw new ApiError(404, "Monitor não encontrado", "not_found");
  return prisma.monitor.update({ where: { id }, data });
}

export async function deleteMonitor(userId: string, id: string) {
  const prisma = requirePrisma();
  const m = await prisma.monitor.findFirst({ where: { id, userId } });
  if (!m) throw new ApiError(404, "Monitor não encontrado", "not_found");
  await prisma.monitor.delete({ where: { id } });
}

export async function listEvents(userId: string, opts: { unread?: boolean; limit?: number } = {}) {
  const prisma = requirePrisma();
  const [items, unread] = await Promise.all([
    prisma.monitorEvent.findMany({ where: { userId, ...(opts.unread ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: Math.min(100, opts.limit ?? 30) }),
    prisma.monitorEvent.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(userId: string, ids?: string[]) {
  const r = await requirePrisma().monitorEvent.updateMany({ where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  return { updated: r.count };
}

/* ------------------------------------------------------------------ alert engine */

export const fingerprintOf = (parts: Array<string | number | null | undefined>) => createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex").slice(0, 40);

export interface SetupFact {
  state: string;
  score: number;
  direction: string;
  entryLow: number | null;
  triggeredAt: number | null;
}

/** Decide se o estado atual do setup gera evento (função pura, testada). */
export function setupEventFor(m: { id: string; states: string[]; minScore: number; lastState: string | null }, f: SetupFact): { fingerprint: string } | null {
  if (f.state === m.lastState) return null;
  if (!m.states.includes(f.state)) return null;
  if (!CLOSING.has(f.state) && f.score < m.minScore) return null;
  return { fingerprint: fingerprintOf([m.id, "SETUP", f.state, f.direction, f.entryLow != null ? f.entryLow.toPrecision(6) : "", f.triggeredAt]) };
}

function setupFact(c: MarketContext): SetupFact {
  return { state: c.setup?.state ?? "NONE", score: c.confluence.score, direction: c.confluence.direction, entryLow: c.setup?.entryZone.low ?? null, triggeredAt: c.setup?.triggeredAt ?? null };
}

function setupText(c: MarketContext) {
  const s = c.setup;
  const head = `${c.symbol}/USDT ${c.timeframe.toUpperCase()} · ${VENUE_LABEL[c.exchange]} ${INSTRUMENT_LABEL[c.instrument]}`;
  if (!s) return { title: `${head}: sem setup`, body: c.confluence.noTradeReasons[0] ?? "sem geometria de setup" };
  const dir = directionPt(s.direction).toLowerCase();
  return {
    title: `${head}: ${pt(SETUP_STATE_PT, s.state)} (${dir})`,
    body: `Confluence ${c.confluence.score}/100 (${pt(SCORE_LABEL_PT, c.confluence.label).toLowerCase()}) · zona ${formatPrice(s.entryZone.low)}–${formatPrice(s.entryZone.high)} · stop ${formatPrice(s.stop)} · TP1 ${s.targets[0] ? formatPrice(s.targets[0].price) : "—"}${s.triggerLevel ? ` · gatilho ${formatPrice(s.triggerLevel.price)}` : ""}. ${s.stateReason}.`,
  };
}

async function deliver(ev: { id: string; userId: string; title: string; body: string; url: string }, m: { notifyPush: boolean; notifyTelegram: boolean }, telegramChatId: string | null) {
  const channels = ["inapp"];
  if (m.notifyPush) {
    const r = await sendPushToUser(ev.userId, { title: ev.title, body: ev.body, url: ev.url, tag: ev.id }).catch(() => ({ sent: 0 }));
    if (r.sent > 0) channels.push("push");
  }
  if (m.notifyTelegram && telegramChatId) {
    const r = await sendTelegramMessage(telegramChatId, `<b>${escapeHtml(ev.title)}</b>\n${escapeHtml(ev.body)}`).catch(() => ({ ok: false }));
    if (r.ok) channels.push("telegram");
  }
  await requirePrisma().monitorEvent.update({ where: { id: ev.id }, data: { channels } });
}

/** Grava o evento; se a fingerprint já existe (fato já notificado), não faz nada. */
async function emit(userId: string, monitorId: string, fingerprint: string, kind: string, title: string, body: string, payload: Record<string, unknown>) {
  try {
    return await requirePrisma().monitorEvent.create({ data: { userId, monitorId, fingerprint, kind, title, body, payload: payload as object } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return null; // duplicado: dedup pelo índice único
    throw err;
  }
}

/**
 * Avalia monitores ativos (mais antigos primeiro) dentro do orçamento de tempo do ciclo.
 * Contextos iguais (ativo × TF × venue × instrumento) são calculados uma vez.
 */
export async function evaluateMonitors(opts: { budgetMs?: number; batch?: number } = {}) {
  const prisma = requirePrisma();
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  const monitors = await prisma.monitor.findMany({
    where: { active: true },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: opts.batch ?? 60,
    include: { user: { select: { telegramChatId: true, role: true, subscription: true } }, strategy: true },
  });
  const ctxCache = new Map<string, Promise<MarketContext>>();
  let checked = 0;
  let events = 0;
  let errors = 0;
  for (const m of monitors) {
    if (Date.now() - t0 > budget) break;
    checked++;
    // sem assinatura ativa o monitor pausa (dados preservados); reativado pelo usuário depois de assinar
    if (!ENTITLEMENTS[tierFor(m.user.subscription, m.user.role)].core) {
      await prisma.monitor.update({ where: { id: m.id }, data: { active: false, lastCheckedAt: new Date(), lastError: "pausado: assinatura inativa" } });
      continue;
    }
    try {
      if (m.kind === "STRATEGY" && m.strategy) {
        const def = definitionSchema.parse(m.strategy.definition);
        const ev = await evaluateLive(def, m.symbol, m.exchange as Venue, m.instrument as Instrument);
        const state = ev.pass ? "PASS" : "FAIL";
        if (ev.pass && m.lastState !== "PASS" && m.lastState !== null) {
          const fp = fingerprintOf([m.id, "STRATEGY", ev.lastClosedAt]);
          const title = `${m.symbol}/USDT: “${m.strategy.name}” passou a valer`;
          const body = `${ev.groups.flatMap((g) => g.results).filter((r) => r.pass).length} condições atendidas no fechamento · ${VENUE_LABEL[ev.dataVenue]} ${INSTRUMENT_LABEL[ev.instrument]}${ev.price != null ? ` · preço ${formatPrice(ev.price)}` : ""}.`;
          const created = await emit(m.userId, m.id, fp, "STRATEGY_PASS", title, body, { strategyId: m.strategy.id, price: ev.price, lastClosedAt: ev.lastClosedAt });
          if (created) {
            events++;
            await deliver({ id: created.id, userId: m.userId, title, body, url: `/charts/${m.symbol}?tf=${ev.executionTf}&exchange=${m.exchange}&instrument=${m.instrument}` }, m, m.user.telegramChatId);
            await track("monitor_event", { userId: m.userId, props: { kind: "STRATEGY_PASS" } });
          }
        }
        await prisma.monitor.update({ where: { id: m.id }, data: { lastState: state, lastScore: null, lastCheckedAt: new Date(), lastError: ev.missing.length ? `sem dado: ${ev.missing.join(", ")}`.slice(0, 300) : null } });
        continue;
      }
      const key = `${m.exchange}:${m.instrument}:${m.symbol}:${m.timeframe}`;
      let p = ctxCache.get(key);
      if (!p) {
        p = getMarketContext(m.symbol, m.timeframe as Timeframe, { exchange: m.exchange as Venue, instrument: m.instrument as Instrument });
        ctxCache.set(key, p);
      }
      const c = await p;
      const f = setupFact(c);
      // primeira avaliação só registra o estado de partida (sem notificar o que já estava assim)
      const hit = m.lastState === null ? null : setupEventFor(m, f);
      if (hit) {
        const { title, body } = setupText(c);
        const created = await emit(m.userId, m.id, hit.fingerprint, `SETUP_${f.state}`, title, body, { state: f.state, score: f.score, direction: f.direction, contextKey: c.contextKey });
        if (created) {
          events++;
          await deliver({ id: created.id, userId: m.userId, title, body, url: `/charts/${m.symbol}?tf=${m.timeframe}&exchange=${m.exchange}&instrument=${m.instrument}` }, m, m.user.telegramChatId);
          await track("monitor_event", { userId: m.userId, props: { kind: `SETUP_${f.state}` } });
        }
      }
      await prisma.monitor.update({ where: { id: m.id }, data: { lastState: f.state, lastScore: f.score, lastCheckedAt: new Date(), lastError: c.dataVenue !== c.exchange ? `dados de ${VENUE_LABEL[c.dataVenue]} (fallback)` : null } });
    } catch (err) {
      errors++;
      log.warn("monitor falhou", { id: m.id, error: (err as Error).message });
      await prisma.monitor.update({ where: { id: m.id }, data: { lastCheckedAt: new Date(), lastError: (err as Error).message.slice(0, 300) } }).catch(() => undefined);
    }
  }
  return { monitors: monitors.length, checked, events, errors, ms: Date.now() - t0 };
}
