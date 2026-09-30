import type Anthropic from "@anthropic-ai/sdk";
import { getPrisma, requirePrisma } from "@/database/client";
import { ASSETS } from "@/lib/assets";
import { getEnv, isLlmConfigured } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { isTimeframe } from "@/lib/timeframes";
import { INSTRUMENTS, VENUES, type Instrument, type Venue } from "@/lib/venues";
import type { Timeframe } from "@/types/market";
import { compactContext, deterministicBrief, numbersInText, unknownNumbers } from "@/services/ai-analyst-service";
import { getMarketContext } from "@/services/market-context-service";
import { getMarketOverview } from "@/services/market-overview-service";
import { getTickers } from "@/services/market/market-service";
import { getPatternStats, STATS_TIMEFRAMES, type StatsTimeframe } from "@/services/pattern-stats-service";
import { runScan } from "@/services/scanner-service";
import { getSignalsBoard } from "@/services/signals-service";

/**
 * Analista IA v2 — conversa com histórico, ferramentas e resposta em fluxo.
 *
 * Regras que não mudam com o modelo:
 *  1. O modelo NÃO recebe candles nem calcula nada: consulta ferramentas do app (contexto do ativo, scanner,
 *     sinais do modelo validado, taxa de acerto, panorama, cotação) e escreve com os números devolvidos.
 *  2. Guarda-corpo numérico: todo número da resposta precisa existir nos resultados das ferramentas
 *     (ou na pergunta do usuário). Se sobrar número desconhecido, o modelo reescreve uma vez; se ainda
 *     sobrar, a resposta vai marcada com a lista de números não conferidos.
 *  3. Nenhuma ação é executada pelo modelo: "propor_alerta" só devolve uma proposta; o usuário confirma na tela.
 *  4. Sem recomendação de compra/venda/alavancagem.
 */
const log = createLogger("analyst-chat");

export const MAX_TOOL_ROUNDS = 6;
const HISTORY_MESSAGES = 16;
const TOOL_RESULT_MAX_CHARS = 12_000;

export interface ChatSelection {
  symbol: string;
  tf: Timeframe;
  exchange: Venue;
  instrument: Instrument;
}

export type ChatEvent =
  | { type: "meta"; conversationId: string; llm: boolean; model: string | null }
  | { type: "tool"; name: string; label: string; status: "start" | "ok" | "error"; ms?: number }
  | { type: "text"; delta: string }
  | { type: "replace"; text: string }
  | { type: "action"; action: AnalystAction }
  | { type: "done"; messageId: string; unverified: number[]; tools: string[] }
  | { type: "error"; message: string };

export interface AnalystAction {
  kind: "create_alert";
  symbol: string;
  alertKind: "price_above" | "price_below";
  threshold: number;
  note: string;
}

export interface ChatMeta {
  tools: string[];
  unverified: number[];
  actions: AnalystAction[];
  model: string | null;
  llm: boolean;
}

/* ------------------------------------------------------------------ ferramentas */

const TOOL_LABELS: Record<string, string> = {
  contexto_ativo: "Análise completa do ativo",
  sinais_modelo: "Sinais do modelo validado",
  scanner_padroes: "Scanner de padrões",
  taxa_acerto: "Taxa de acerto dos padrões",
  panorama_mercado: "Panorama do mercado",
  cotacao: "Cotação",
  propor_alerta: "Proposta de alerta",
};

const SYMBOLS = ASSETS.map((a) => a.symbol);

export const ANALYST_TOOLS: Anthropic.Tool[] = [
  {
    name: "contexto_ativo",
    description: "Análise completa de um ativo em um timeframe: estrutura (viés, BOS/CHoCH), regime, liquidez, suportes/resistências, Confluence Score, setup (entrada/stop/alvo/R:R quando há), derivativos e histórico do setup. Use para qualquer pergunta sobre um ativo específico.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: `Ticker sem USDT. Um de: ${SYMBOLS.join(", ")}` },
        tf: { type: "string", description: "Timeframe: 1h, 4h, 1d ou 1w (padrão: o timeframe ativo na tela)" },
        exchange: { type: "string", enum: [...VENUES], description: "Corretora (padrão: a ativa na tela)" },
        instrument: { type: "string", enum: [...INSTRUMENTS], description: "spot ou perp (padrão: o ativo na tela)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "sinais_modelo",
    description: "Posições abertas e saídas recentes do modelo de rompimento validado fora da amostra (Donchian 55 + EMA 200, 4H e 1D), com entrada, stop vigente, preço e resultado aberto em R. Use quando perguntarem por sinais, oportunidades do modelo ou 'o que está ativo agora'.",
    input_schema: { type: "object", properties: { tf: { type: "string", description: "Filtrar por 4h ou 1d (opcional)" } } },
  },
  {
    name: "scanner_padroes",
    description: "Padrões gráficos em formação nos 30 ativos (ou em um ativo), com direção, confiança, alvo e stop, além de RSI, tendência e variação 24h. Timeframes 4h ou 1d.",
    input_schema: { type: "object", properties: { tf: { type: "string", description: "4h ou 1d" }, symbol: { type: "string", description: "Ticker para filtrar (opcional)" } }, required: ["tf"] },
  },
  {
    name: "taxa_acerto",
    description: "Taxa de acerto histórica (backtest walk-forward) de cada padrão gráfico: amostras, acerto, expectativa em R, fator de lucro e intervalo de confiança. Use para 'qual padrão funciona melhor' ou 'esse padrão é confiável'.",
    input_schema: { type: "object", properties: { tf: { type: "string", description: "4h ou 1d" }, symbol: { type: "string", description: "Restringir a um ativo (opcional)" } }, required: ["tf"] },
  },
  {
    name: "panorama_mercado",
    description: "Visão geral do mercado: capitalização total e variação 24h, dominância BTC/ETH, índice Medo & Ganância, maiores altas e baixas e líderes de volume.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cotacao",
    description: "Preço atual, variação 24h e volume de um ou mais ativos monitorados.",
    input_schema: { type: "object", properties: { symbols: { type: "array", items: { type: "string" }, description: "Tickers sem USDT" } }, required: ["symbols"] },
  },
  {
    name: "propor_alerta",
    description: "Propõe um alerta de preço para o usuário confirmar na tela (não cria nada sozinho). Use só quando o usuário pedir para ser avisado em um nível de preço que apareceu nos dados.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        kind: { type: "string", enum: ["price_above", "price_below"], description: "price_above: avisar quando o preço subir acima do nível; price_below: quando cair abaixo" },
        threshold: { type: "number", description: "Nível de preço em USDT, exatamente como veio das ferramentas" },
        note: { type: "string", description: "Motivo em uma frase (ex.: resistência mais próxima no 4H)" },
      },
      required: ["symbol", "kind", "threshold", "note"],
    },
  },
];

const round = (v: number | null | undefined, d = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const tfOf = (v: unknown, fallback: Timeframe): Timeframe => (typeof v === "string" && isTimeframe(v.toLowerCase()) ? (v.toLowerCase() as Timeframe) : fallback);
const symOf = (v: unknown): string | null => {
  const s = String(v ?? "")
    .toUpperCase()
    .replace(/USDT$/, "")
    .trim();
  return SYMBOLS.includes(s) ? s : null;
};

export interface ToolEnv {
  selection: ChatSelection;
  /** timeframes liberados no plano do usuário */
  timeframes: readonly string[];
}

/** Executa uma ferramenta; devolve um objeto serializável (ou { error }) — nunca lança. */
export async function runTool(name: string, input: Record<string, unknown>, env: ToolEnv): Promise<unknown> {
  try {
    switch (name) {
      case "contexto_ativo": {
        const symbol = symOf(input.symbol);
        if (!symbol) return { error: `ativo não monitorado: ${String(input.symbol)}. Ativos: ${SYMBOLS.join(", ")}` };
        const tf = tfOf(input.tf, env.selection.tf);
        if (!env.timeframes.includes(tf)) return { error: `timeframe ${tf} não incluído no plano do usuário` };
        const exchange = (VENUES as readonly string[]).includes(String(input.exchange)) ? (input.exchange as Venue) : env.selection.exchange;
        const instrument = (INSTRUMENTS as readonly string[]).includes(String(input.instrument)) ? (input.instrument as Instrument) : env.selection.instrument;
        const c = await getMarketContext(symbol, tf, { exchange, instrument });
        return compactContext(c);
      }
      case "sinais_modelo": {
        const b = await getSignalsBoard();
        const tf = typeof input.tf === "string" && isTimeframe(input.tf.toLowerCase()) ? (input.tf.toLowerCase() as Timeframe) : null;
        const active = b.active.filter((s) => !tf || s.tf === tf).map((s) => ({ model: s.model, symbol: s.symbol, tf: s.tf, entryTime: new Date(s.entryTime).toISOString(), entry: s.entry, initialStop: s.initialStop, stop: s.stop, price: s.price, openR: round(s.openR, 2), lockedR: round(s.lockedR, 2), stopDistancePct: round(s.stopDistancePct, 2), barsOpen: s.barsOpen, isNew: s.isNew }));
        const recent = b.recent.filter((s) => !tf || s.tf === tf).slice(0, 15).map((s) => ({ symbol: s.symbol, tf: s.tf, exitTime: new Date(s.exitTime).toISOString(), rNet: round(s.rNet, 2) }));
        return { generatedAt: new Date(b.generatedAt).toISOString(), models: b.models.map((m) => ({ name: m.name, tf: m.tf, validation: m.validation.metrics })), activeCount: active.length, active, recentExits: recent, errors: b.errors.slice(0, 3) };
      }
      case "scanner_padroes": {
        const tf = tfOf(input.tf, "4h");
        if (!(STATS_TIMEFRAMES as readonly string[]).includes(tf)) return { error: "scanner disponível em 4h e 1d" };
        if (!env.timeframes.includes(tf)) return { error: `timeframe ${tf} não incluído no plano do usuário` };
        const symbol = input.symbol ? symOf(input.symbol) : null;
        const r = await runScan({ timeframe: tf, includeVolume: false });
        const rows = r.rows
          .filter((row) => !symbol || row.symbol === symbol)
          .map((row) => ({ symbol: row.symbol, price: row.price, changePct24h: round(row.changePct24h, 2), rsi14: round(row.rsi14, 1), trend: row.trend, signal: row.signal, signalScore: row.signalScore, patterns: row.patterns.map((p) => ({ pattern: p.label, direction: p.direction, confidence: p.confidence, price: p.price, target: p.target, stop: p.stop })) }))
          .sort((a, b) => b.patterns.length - a.patterns.length || b.signalScore - a.signalScore)
          .slice(0, symbol ? 1 : 12);
        return { timeframe: tf, scannedAt: new Date(r.scannedAt).toISOString(), assetsAnalyzed: r.assetsAnalyzed, withPatterns: r.rows.filter((x) => x.patterns.length).length, rows };
      }
      case "taxa_acerto": {
        const tf = tfOf(input.tf, "4h");
        if (!(STATS_TIMEFRAMES as readonly string[]).includes(tf)) return { error: "estatísticas disponíveis em 4h e 1d" };
        const symbol = input.symbol ? symOf(input.symbol) : null;
        const rep = await getPatternStats(tf as StatsTimeframe, symbol ? { symbol } : {});
        return {
          timeframe: tf,
          scope: symbol ?? `universo (${rep.assets} ativos)`,
          period: { from: new Date(rep.fromTime).toISOString().slice(0, 10), to: new Date(rep.toTime).toISOString().slice(0, 10) },
          totalTrades: rep.totalTrades,
          minSample: rep.minSample,
          rows: rep.rows.slice(0, 20).map((x) => ({ pattern: x.label, direction: x.direction, samples: x.samples, hitRatePct: x.hitRate == null ? null : round(x.hitRate * 100, 1), ci95Pct: x.ci ? [round(x.ci.low * 100, 1), round(x.ci.high * 100, 1)] : null, expectancyR: round(x.expectancyR, 2), profitFactor: x.profitFactor == null || !Number.isFinite(x.profitFactor) ? null : round(x.profitFactor, 2), hit1RPct: x.hit1R == null ? null : round(x.hit1R * 100, 0), lowSample: x.samples < rep.minSample })),
        };
      }
      case "panorama_mercado": {
        const o = await getMarketOverview();
        const mv = (rows: typeof o.topGainers) => rows.slice(0, 5).map((m) => ({ symbol: m.symbol, price: m.price, changePct24h: round(m.changePct24h, 2) }));
        return {
          generatedAt: new Date(o.generatedAt).toISOString(),
          global: o.global ? { totalMarketCapUsdBi: round(o.global.totalMarketCapUsd / 1e9, 1), marketCapChange24hPct: round(o.global.marketCapChange24hPct, 2), totalVolumeUsdBi: round(o.global.totalVolumeUsd / 1e9, 1), btcDominancePct: round(o.global.btcDominance, 1), ethDominancePct: round(o.global.ethDominance, 1), stale: o.global.stale } : null,
          fearGreed: o.fearGreed ? { value: o.fearGreed.value, classification: o.fearGreed.classification } : null,
          topGainers: mv(o.topGainers),
          topLosers: mv(o.topLosers),
          volumeLeaders: o.volumeLeaders.slice(0, 5).map((m) => ({ symbol: m.symbol, volume24hUsdMi: round(m.volume24h / 1e6, 1) })),
        };
      }
      case "cotacao": {
        const want = (Array.isArray(input.symbols) ? input.symbols : [input.symbols]).map(symOf).filter((s): s is string => Boolean(s));
        if (!want.length) return { error: "nenhum ativo monitorado informado" };
        const t = await getTickers();
        return { fetchedAt: new Date(t.fetchedAt).toISOString(), stale: t.stale, tickers: t.tickers.filter((x) => want.includes(x.symbol)).map((x) => ({ symbol: x.symbol, price: x.price, changePct24h: round(x.changePct24h, 2), quoteVolume24hUsdMi: round(x.quoteVolume24h / 1e6, 1) })) };
      }
      case "propor_alerta": {
        const symbol = symOf(input.symbol);
        const kind = input.kind === "price_below" ? "price_below" : input.kind === "price_above" ? "price_above" : null;
        const threshold = Number(input.threshold);
        if (!symbol || !kind || !Number.isFinite(threshold) || threshold <= 0) return { error: "proposta inválida (ativo, tipo ou nível)" };
        return { proposed: true, action: { kind: "create_alert", symbol, alertKind: kind, threshold, note: String(input.note ?? "").slice(0, 160) } satisfies AnalystAction, instruction: "A proposta aparece como botão para o usuário confirmar. Diga em uma frase o que o alerta faz." };
      }
      default:
        return { error: `ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    log.warn("ferramenta falhou", { name, error: (err as Error).message });
    return { error: `falha ao consultar ${name}: ${(err as Error).message.slice(0, 160)}` };
  }
}

/* ------------------------------------------------------------------ prompt */

export function systemPrompt(sel: ChatSelection, opts: { tier: string; timeframes: readonly string[]; now: Date }): string {
  return [
    "Você é o Analista IA do CryptoScanner, uma ferramenta de análise técnica de criptoativos. Responde em português do Brasil, registro técnico e direto, sem metáforas.",
    "",
    "REGRAS OBRIGATÓRIAS",
    "1. Todo número que você escrever (preço, nível, indicador, percentual, R, contagem) precisa ter vindo do resultado de uma ferramenta nesta conversa ou da pergunta do usuário. Nunca calcule, estime, arredonde de forma diferente nem invente. Se não há dado, diga que não há.",
    "2. Antes de responder qualquer pergunta factual sobre mercado, consulte a ferramenta adequada. Não responda de memória.",
    "3. Não recomende comprar, vender, manter ou alavancar, e não diga o que o usuário 'deve' fazer. Descreva estrutura, níveis, sinais, riscos e o que observar; a decisão é dele. Se pedirem recomendação, explique isso em uma frase e entregue os dados.",
    "4. Não execute ações. Para alerta de preço use propor_alerta; o usuário confirma na tela.",
    "5. Cite a fonte e o horário dos dados de forma curta (ex.: 'scanner 4H, 14:05 UTC').",
    "6. Formato: parágrafos curtos, listas com '-' quando houver mais de dois itens, negrito só em rótulos. Sem título grande. Máximo ~250 palavras, a menos que o usuário peça detalhe. Números no padrão brasileiro: vírgula decimal e ponto de milhar (US$ 117.360,50 · 1,07 ATR · 52,3%); preços em US$.",
    "7. Se o ativo não for informado, use o ativo ativo na tela. Ativos monitorados: " + SYMBOLS.join(", ") + ".",
    "",
    `CONTEXTO DA TELA: ativo ${sel.symbol}, timeframe ${sel.tf.toUpperCase()}, corretora ${sel.exchange}, instrumento ${sel.instrument}. Plano do usuário: ${opts.tier}; timeframes liberados: ${opts.timeframes.join(", ")}. Agora: ${opts.now.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "",
    "Sobre o app: Confluence Score (0–100) mede qualidade de confluência técnica, não probabilidade. 'R' é múltiplo do risco inicial (entrada − stop). O modelo de rompimento foi validado fora da amostra; resultado passado não garante futuro. Nenhuma ferramenta executa ordens.",
  ].join("\n");
}

/* ------------------------------------------------------------------ persistência */

async function loadHistory(conversationId: string): Promise<Anthropic.MessageParam[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const rows = await prisma.analystMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: HISTORY_MESSAGES, select: { role: true, content: true } });
  return rows
    .reverse()
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));
}

export async function ensureConversation(userId: string, conversationId: string | undefined, firstMessage: string): Promise<{ id: string; created: boolean }> {
  const prisma = requirePrisma();
  if (conversationId) {
    const c = await prisma.analystConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
    if (c) return { id: c.id, created: false };
  }
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "Conversa";
  const c = await prisma.analystConversation.create({ data: { userId, title }, select: { id: true } });
  return { id: c.id, created: true };
}

/* ------------------------------------------------------------------ guarda-corpo */

/** Números permitidos: resultados das ferramentas, pergunta do usuário, tamanhos de listas, anos. */
export function allowedNumbersFrom(toolResults: unknown[], userText: string): unknown {
  const extra: number[] = numbersInText(userText);
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      extra.push(v.length);
      v.forEach(walk);
    } else if (v && typeof v === "object") Object.values(v).forEach(walk);
    else if (typeof v === "string") {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) extra.push(Number(m[1]), Number(m[2]), Number(m[3]));
    }
  };
  toolResults.forEach(walk);
  const year = new Date().getUTCFullYear();
  return { toolResults, extra: [...extra, year - 1, year, year + 1, 24, 30, 55, 200, 100] };
}

/** Base da API: um simulador (LLM_BASE_URL_TEST) só é aceito quando o app roda em localhost. */
export function llmBaseUrl(): string | undefined {
  const test = process.env.LLM_BASE_URL_TEST;
  return test && /^http:\/\/localhost(:\d+)?\/?$/.test(getEnv().NEXT_PUBLIC_APP_URL) ? test.replace(/\/$/, "") : undefined;
}

/* ------------------------------------------------------------------ execução */

export interface ChatRunInput {
  userId: string;
  conversationId?: string;
  message: string;
  selection: ChatSelection;
  tier: string;
  timeframes: readonly string[];
  signal?: AbortSignal;
}

function deterministicAnswer(sel: ChatSelection): Promise<string> {
  return getMarketContext(sel.symbol, sel.tf, { exchange: sel.exchange, instrument: sel.instrument }).then((c) => {
    const b = deterministicBrief(c);
    return [b.headline, "", ...b.sections.flatMap((s) => [`**${s.title}**`, ...s.lines.map((l) => `- ${l}`), ""])].join("\n").trim();
  });
}

/**
 * Roda uma rodada da conversa e emite eventos (SSE). Persiste a pergunta e a resposta.
 */
export async function runAnalystChat(input: ChatRunInput, emit: (e: ChatEvent) => void): Promise<void> {
  const prisma = requirePrisma();
  const env = getEnv();
  const conv = await ensureConversation(input.userId, input.conversationId, input.message);
  const llm = isLlmConfigured();
  emit({ type: "meta", conversationId: conv.id, llm, model: llm ? env.LLM_MODEL : null });
  const history = conv.created ? [] : await loadHistory(conv.id);
  await prisma.analystMessage.create({ data: { conversationId: conv.id, role: "user", content: input.message } });

  const finish = async (text: string, meta: ChatMeta) => {
    const m = await prisma.analystMessage.create({ data: { conversationId: conv.id, role: "assistant", content: text, meta: meta as object }, select: { id: true } });
    await prisma.analystConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
    emit({ type: "done", messageId: m.id, unverified: meta.unverified, tools: meta.tools });
  };

  if (!llm) {
    // sem modelo configurado: leitura determinística do contexto da tela + aviso
    let text: string;
    try {
      text = await deterministicAnswer(input.selection);
    } catch (err) {
      // a causa técnica fica só no log; o usuário recebe texto fixo
      log.warn("contexto indisponível para a resposta automática", { symbol: input.selection.symbol, tf: input.selection.tf, error: (err as Error).message });
      text = `Não consegui montar o contexto de ${input.selection.symbol} ${input.selection.tf.toUpperCase()} agora. Os dados de mercado não responderam; tente de novo em alguns minutos.`;
    }
    text += "\n\n_Resposta automática montada com os dados desta tela (estrutura, níveis e setup). Para perguntas abertas, use as sugestões acima._";
    emit({ type: "text", delta: text });
    await finish(text, { tools: ["contexto_ativo"], unverified: [], actions: [], model: null, llm: false });
    return;
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: env.LLM_TIMEOUT_MS * 2, baseURL: llmBaseUrl() });
  const system = systemPrompt(input.selection, { tier: input.tier, timeframes: input.timeframes, now: new Date() });
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: input.message }];
  const toolEnv: ToolEnv = { selection: input.selection, timeframes: input.timeframes };
  const toolsUsed: string[] = [];
  const toolResults: unknown[] = [];
  const actions: AnalystAction[] = [];
  let finalText = "";
  let streamedChars = 0;

  const t0 = Date.now();
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({ model: env.LLM_MODEL, max_tokens: 1400, system, tools: ANALYST_TOOLS, messages }, { signal: input.signal });
    let roundText = "";
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        roundText += ev.delta.text;
        emit({ type: "text", delta: ev.delta.text });
        streamedChars += ev.delta.text.length;
      }
    }
    const msg = await stream.finalMessage();
    finalText += (finalText && roundText ? "\n\n" : "") + roundText;
    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !toolUses.length) break;
    if (round === MAX_TOOL_ROUNDS) {
      log.warn("limite de rodadas de ferramentas", { conversationId: conv.id });
      break;
    }
    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const label = TOOL_LABELS[tu.name] ?? tu.name;
      emit({ type: "tool", name: tu.name, label, status: "start" });
      const ts = Date.now();
      const out = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, toolEnv);
      const failed = Boolean(out && typeof out === "object" && "error" in (out as object));
      emit({ type: "tool", name: tu.name, label, status: failed ? "error" : "ok", ms: Date.now() - ts });
      if (!failed) {
        toolsUsed.push(tu.name);
        toolResults.push(out);
        if (tu.name === "propor_alerta" && out && typeof out === "object" && "action" in (out as object)) {
          const a = (out as { action: AnalystAction }).action;
          actions.push(a);
          emit({ type: "action", action: a });
        }
      }
      let text = JSON.stringify(out);
      if (text.length > TOOL_RESULT_MAX_CHARS) text = text.slice(0, TOOL_RESULT_MAX_CHARS) + "…(truncado)";
      results.push({ type: "tool_result", tool_use_id: tu.id, content: text, is_error: failed });
    }
    messages.push({ role: "user", content: results });
  }

  // guarda-corpo numérico: uma reescrita, depois marca o que sobrou
  let unverified = unknownNumbers(finalText, allowedNumbersFrom(toolResults, input.message));
  if (unverified.length && finalText.trim()) {
    try {
      const fix = await client.messages.create(
        {
          model: env.LLM_MODEL,
          max_tokens: 1400,
          system,
          messages: [
            ...messages,
            { role: "assistant", content: finalText },
            { role: "user", content: `Os números ${unverified.slice(0, 8).join(", ")} não constam nos resultados das ferramentas nem na pergunta. Reescreva a resposta inteira usando somente números que constam nos resultados (ou diga que o dado não está disponível). Responda só com a resposta final.` },
          ],
        },
        { signal: input.signal },
      );
      const fixed = fix.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const still = unknownNumbers(fixed, allowedNumbersFrom(toolResults, input.message));
      if (fixed && still.length < unverified.length) {
        finalText = fixed;
        unverified = still;
        emit({ type: "replace", text: fixed });
      }
    } catch (err) {
      log.warn("reescrita falhou", { error: (err as Error).message });
    }
  }
  if (!finalText.trim()) {
    finalText = "Não consegui produzir uma resposta agora. Tente reformular a pergunta.";
    if (!streamedChars) emit({ type: "text", delta: finalText });
  }
  log.info("resposta concluída", { conversationId: conv.id, ms: Date.now() - t0, tools: toolsUsed, unverified: unverified.slice(0, 5) });
  await finish(finalText, { tools: [...new Set(toolsUsed)], unverified: unverified.slice(0, 10), actions, model: env.LLM_MODEL, llm: true });
}
