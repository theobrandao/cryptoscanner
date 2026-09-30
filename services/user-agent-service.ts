import type { Agent, Prisma } from "@prisma/client";
import { runAgent } from "@/agents/runtime";
import { sentimentAgent, type SentimentOutput } from "@/agents/sentiment-agent";
import { createStrategyContext, evaluateStrategies, type StrategySignal } from "@/agents/strategies";
import { createDefaultTools } from "@/agents/tools";
import { getPrisma, requirePrisma } from "@/database/client";
import { allowsTimeframe } from "@/lib/access-policy";
import { automationsAllowed } from "@/lib/admin-users";
import { tierFor } from "@/lib/entitlements";
import { runWithConcurrency } from "@/lib/cron";
import { getEnv, isTelegramConfigured } from "@/lib/env";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { createLogger } from "@/lib/logger";
import { detectPatterns } from "@/lib/patterns/detect";
import { getCandles } from "@/services/market/market-service";
import { sendPushToUser } from "@/services/push-service";
import { escapeHtml, sendTelegramMessage } from "@/services/telegram";
import type { Timeframe } from "@/types/market";

const log = createLogger("user-agents");

export interface AgentRunSummary {
  agentId: string;
  evaluated: number;
  signals: StrategySignal[];
  alertsSent: number;
  skippedByCooldown: boolean;
  errors: Array<{ symbol?: string; strategy?: string; error: string }>;
}

async function getSentimentFor(symbol: string): Promise<SentimentOutput | null> {
  const r = await runAgent(sentimentAgent, { symbol, useLlm: false }, { tools: createDefaultTools() });
  return r.output;
}

/**
 * Executa um Agent do usuário: avalia as estratégias configuradas em cada ativo, registra logs,
 * respeita o cooldown entre alertas e envia Telegram quando configurado.
 * Comportamento público da referência: verificação a cada 5 min, cooldown mínimo de 30 min.
 */
export async function runUserAgent(agent: Agent, options: { force?: boolean; now?: Date } = {}): Promise<AgentRunSummary> {
  const prisma = requirePrisma();
  const now = options.now ?? new Date();
  const cooldownMs = getEnv().AGENT_ALERT_COOLDOWN_MINUTES * 60_000;
  const inCooldown = agent.lastAlertAt ? now.getTime() - agent.lastAlertAt.getTime() < cooldownMs : false;
  const summary: AgentRunSummary = { agentId: agent.id, evaluated: 0, signals: [], alertsSent: 0, skippedByCooldown: false, errors: [] };
  const timeframe = agent.timeframe as Timeframe;

  for (const symbol of agent.symbols) {
    const ctx = createStrategyContext({
      symbol,
      timeframe,
      getCandles: async (s, tf) => (await getCandles(s, tf, { limit: 300 })).candles,
      snapshot: computeSnapshot,
      detectPatterns: (c) => detectPatterns(c, { minConfidence: 55 }),
      getSentiment: getSentimentFor,
    });
    try {
      const { signals, errors } = await evaluateStrategies(agent.strategies, ctx);
      summary.evaluated++;
      summary.errors.push(...errors.map((e) => ({ symbol, ...e })));
      const qualified = signals.filter((s) => s.confidence >= agent.minConfidence);
      summary.signals.push(...qualified);
      for (const s of signals) {
        await prisma.agentLog.create({
          data: {
            agentId: agent.id,
            level: s.confidence >= agent.minConfidence ? "signal" : "info",
            symbol,
            message: `${s.side === "buy" ? "COMPRA" : "VENDA"} ${symbol} · ${s.strategy} · confiança ${s.confidence}% · ${s.reason}`,
            data: s as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      summary.errors.push({ symbol, error: (err as Error).message });
      await prisma.agentLog.create({ data: { agentId: agent.id, level: "error", symbol, message: `falha ao avaliar ${symbol}: ${(err as Error).message}` } });
    }
  }

  if (summary.signals.length > 0) {
    if (inCooldown && !options.force) {
      summary.skippedByCooldown = true;
      await prisma.agentLog.create({
        data: {
          agentId: agent.id,
          level: "info",
          message: `${summary.signals.length} sinal(is) acima da confiança mínima, alerta suprimido pelo cooldown de ${getEnv().AGENT_ALERT_COOLDOWN_MINUTES} min`,
        },
      });
    } else {
      const push = await sendPushToUser(agent.userId, {
        title: `${agent.icon} ${agent.name}`,
        body: summary.signals.map((s) => `${s.side === "buy" ? "COMPRA" : "VENDA"} ${s.strategy} ${s.timeframe} · ${s.confidence}%`).join(" | ") + ` — ${agent.symbols.join(", ")}`,
        url: agent.kind === "sentinel" ? "/sentinela" : "/agentes",
        tag: `agent-${agent.id}`,
      }).catch(() => ({ sent: 0, removed: 0 }));
      if (push.sent > 0) summary.alertsSent++;
      const wantsTelegram = agent.notification === "telegram" || agent.notification === "both";
      if (wantsTelegram) {
        const user = await prisma.user.findUnique({ where: { id: agent.userId }, select: { telegramChatId: true } });
        if (user?.telegramChatId && isTelegramConfigured()) {
          const lines = summary.signals.map(
            (s) => `${s.side === "buy" ? "🟢 COMPRA" : "🔴 VENDA"} <b>${escapeHtml(s.strategy)}</b> ${escapeHtml(s.timeframe)} · ${s.confidence}%\n${escapeHtml(s.reason)}`,
          );
          const text = `${agent.icon} <b>${escapeHtml(agent.name)}</b> — ${agent.symbols.join(", ")}\n\n${lines.join("\n\n")}\n\n<i>Informativo; não é recomendação de investimento.</i>`;
          const res = await sendTelegramMessage(user.telegramChatId, text);
          if (res.ok) summary.alertsSent++;
          else await prisma.agentLog.create({ data: { agentId: agent.id, level: "warn", message: `Telegram falhou: ${res.error ?? "erro"}` } });
        } else {
          await prisma.agentLog.create({ data: { agentId: agent.id, level: "warn", message: "Telegram não configurado (chat ID do usuário ou token do bot ausente)" } });
        }
      }
      await prisma.agent.update({ where: { id: agent.id }, data: { lastAlertAt: now } });
    }
  }
  await prisma.agent.update({ where: { id: agent.id }, data: { lastRunAt: now } });
  log.info("agente executado", { agentId: agent.id, signals: summary.signals.length, alertsSent: summary.alertsSent, cooldown: summary.skippedByCooldown });
  return summary;
}

/** Agentes considerados por ciclo (os que rodaram há mais tempo primeiro). */
export const MAX_AGENTS_PER_CYCLE = 2000;

export interface RunAllOptions {
  /** consultado antes de iniciar cada agente (orçamento de tempo do ciclo) */
  shouldStop?: () => boolean;
  /** agentes executados em paralelo */
  concurrency?: number;
  /** agentes carregados por consulta */
  batch?: number;
}

/**
 * Ciclo do worker: executa os agentes ativos de contas não bloqueadas e com acesso (assinatura ativa ou admin).
 * Ordem: `lastRunAt` mais antigo primeiro (quem ficou de fora por falta de tempo vem primeiro no próximo ciclo);
 * lotes com concorrência limitada e parada quando o orçamento do ciclo acaba.
 */
export async function runAllActiveAgents(opts: RunAllOptions = {}): Promise<AgentRunSummary[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const shouldStop = opts.shouldStop ?? (() => false);
  const candidates = await prisma.agent.findMany({
    where: { status: "ACTIVE", user: { blockedAt: null } },
    orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: MAX_AGENTS_PER_CYCLE,
    select: { id: true, timeframe: true, user: { select: { blockedAt: true, role: true, subscription: true } } },
  });
  // sem acesso ou com timeframe fora do plano atual (1H no PRO após sair do ELITE): não roda nem avisa;
  // o agente continua ACTIVE e volta a rodar quando o acesso voltar
  const ids = candidates.filter((c) => automationsAllowed(c.user) && allowsTimeframe(tierFor(c.user.subscription, c.user.role), c.timeframe, "agents")).map((c) => c.id);
  const out: AgentRunSummary[] = [];
  const batch = opts.batch ?? 20;
  let skipped = 0;
  for (let i = 0; i < ids.length; i += batch) {
    const part = ids.slice(i, i + batch);
    if (shouldStop()) {
      skipped += ids.length - i;
      break;
    }
    const rows = await prisma.agent.findMany({ where: { id: { in: part } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const agents = part.flatMap((id) => {
      const a = byId.get(id);
      return a ? [a] : [];
    });
    const r = await runWithConcurrency(agents, opts.concurrency ?? 4, (a) => runUserAgent(a), shouldStop);
    out.push(...r.results);
    for (const e of r.errors) log.error("agente falhou", { agentId: e.item.id, error: e.error.message });
    skipped += r.skipped;
  }
  if (skipped) log.warn("agentes adiados para o próximo ciclo (tempo esgotado)", { skipped });
  return out;
}
