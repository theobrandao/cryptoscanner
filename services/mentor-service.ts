import { ASSETS, getAsset } from "@/lib/assets";
import { PATTERN_LIST } from "@/lib/patterns/catalog";
import { LESSONS } from "@/lib/content/lessons";
import { isLlmConfigured } from "@/lib/env";
import { analyzeAsset } from "@/services/analysis-service";
import { getFearGreed } from "@/services/sentiment/fear-greed";
import { completeJson } from "@/services/llm";
import { z } from "zod";
import type { Timeframe } from "@/types/market";

/**
 * Mentor: assistente determinístico (sem LLM) com base de conhecimento própria — padrões, indicadores,
 * gestão de risco, protocolos de mindset — e respostas com dados reais do mercado (preço, tendência,
 * padrões ativos, Medo & Ganância). Se um provedor LLM estiver configurado, ele redige a resposta final
 * a partir do mesmo material (nunca inventa números: os dados vêm do orquestrador).
 */
export interface MentorReply {
  answer: string;
  sources: string[];
  suggestions: string[];
  mode: "rules" | "llm";
  data?: Record<string, unknown>;
}

const SOS: Record<string, { title: string; steps: string[] }> = {
  stop: {
    title: "🔴 Tomei stop (protocolo anti-revenge)",
    steps: [
      "Registre a operação agora: tese, entrada, stop, resultado e o que o mercado fez diferente do esperado.",
      "Feche a plataforma por 30 minutos. Nenhuma ordem nesse intervalo.",
      "Ao voltar, só opere um setup que passe no checklist completo (tendência maior, nível, volume, R:R ≥ 2).",
      "Mantenha o tamanho de posição igual ou menor. Dobrar para recuperar é a causa nº 1 de sequências de perdas.",
      "Um stop executado no plano é a estratégia funcionando, não um erro.",
    ],
  },
  fomo: {
    title: "🟡 FOMO (está subindo forte)",
    steps: [
      "Meça: quanto o preço já andou desde o rompimento? Se > 1 ATR, a entrada agora tem stop longe e alvo perto (R:R ruim).",
      "Defina onde seria o pullback aceitável (EMA 8/25 ou o nível rompido) e coloque um alerta de preço lá.",
      "Se o pullback não vier, a operação não era sua. Haverá outra — o scanner roda a cada 5 minutos.",
      "Nunca entre por medo de perder; entre porque o plano diz onde, quanto e até onde.",
    ],
  },
  euforia: {
    title: "🟢 Euforia pós-ganho",
    steps: [
      "Reduza o tamanho da próxima operação pela metade: a euforia aumenta o risco sem melhorar o sinal.",
      "Registre o acerto com a mesma disciplina do erro — o que funcionou e o que foi sorte.",
      "Confira o Medo & Ganância: se o mercado inteiro está eufórico, a leitura contrária pede cautela.",
      "Reavalie o plano do dia; não invente novos setups para “aproveitar o momento”.",
    ],
  },
  medo: {
    title: "🔵 Medo de clicar",
    steps: [
      "Cheque o plano: entrada, stop, alvo e tamanho estão escritos? Se sim, a execução é mecânica.",
      "Se não estão, o medo está correto — não há plano para executar. Volte ao gráfico e defina.",
      "Confirme o risco em dinheiro: se perder tudo até o stop, o valor é aceitável? Se não, reduza o tamanho.",
      "Use ordens limitadas no nível planejado em vez de decidir no calor do movimento.",
    ],
  },
  reset: {
    title: "🧘 Reset mental (2 minutos)",
    steps: [
      "Afaste-se da tela. 4 respirações lentas: 4 s inspirando, 6 s soltando.",
      "Diga em voz alta o seu risco máximo por operação e o seu limite de perda do dia.",
      "Pergunte: a próxima ação é do plano ou da emoção?",
      "Se atingiu o limite diário, encerre. O mercado abre amanhã; a conta precisa existir para isso.",
    ],
  },
};

const TF_WORDS: Array<[RegExp, Timeframe]> = [
  [/\b(15m|15 ?min)\b/i, "15m"],
  [/\b(30m|30 ?min)\b/i, "30m"],
  [/\b(1h|1 ?hora)\b/i, "1h"],
  [/\b(4h|4 ?horas)\b/i, "4h"],
  [/\b(1d|di[aá]rio|1 ?dia)\b/i, "1d"],
  [/\b(1w|semanal|7d)\b/i, "1w"],
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function findAsset(text: string): string | null {
  const t = norm(text);
  for (const a of ASSETS) {
    if (new RegExp(`\\b${a.symbol.toLowerCase()}\\b`).test(t) || t.includes(norm(a.name))) return a.symbol;
  }
  if (/\bbitcoin\b/.test(t)) return "BTC";
  if (/\bether\b|\bethereum\b/.test(t)) return "ETH";
  return null;
}

const dirPt = (d: string) => (d === "bullish" ? "de alta" : d === "bearish" ? "de baixa" : "neutra");

export async function answerMentor(message: string, options: { allowLlm?: boolean } = {}): Promise<MentorReply> {
  const t = norm(message);

  // ---- SOS mindset
  const sosKey = /stop|stopado|perdi|preju/.test(t) && /tomei|levei|bati|acabei/.test(t) ? "stop" : /fomo|subindo forte|disparou|perder o movimento|ta subindo|esta subindo/.test(t) ? "fomo" : /euforia|ganhei muito|lucro grande|acertei/.test(t) ? "euforia" : /medo de clicar|medo de entrar|nao consigo entrar|travei/.test(t) ? "medo" : /reset|respira|ansios|nervos|calma/.test(t) ? "reset" : null;
  if (sosKey) {
    const s = SOS[sosKey]!;
    return { answer: `${s.title}\n\n${s.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`, sources: ["Protocolo próprio — Aula 11 (Psicologia)"], suggestions: ["Abrir a aula de psicologia", "Como definir stop e tamanho de posição?"], mode: "rules" };
  }

  // ---- dados ao vivo sobre um ativo
  const symbol = findAsset(t);
  if (symbol && /pre[cç]o|cota[cç][aã]o|tend[eê]ncia|an[aá]lise|analisa|padr[aã]o|padroes|rsi|como esta|como est[aá]|vale a pena|comprar|vender|entrada|alvo|stop/.test(t)) {
    const tf = TF_WORDS.find(([re]) => re.test(t))?.[1] ?? "4h";
    const r = await analyzeAsset({ symbol, timeframe: tf, includeSentiment: true, useLlm: false, trigger: "api" });
    const ta = r.outputs.technical;
    const lines: string[] = [];
    const price = r.keyLevels.price;
    lines.push(`${getAsset(symbol)?.name ?? symbol} (${symbol}) em ${tf.toUpperCase()}: preço ${price ? `US$ ${price.toLocaleString("pt-BR", { maximumFractionDigits: price < 1 ? 4 : 2 })}` : "—"}, veredito do orquestrador ${dirPt(r.verdict)} com confiança ${Math.round(r.confidence)}/100 e risco ${r.riskLevel}.`);
    if (r.keyLevels.support || r.keyLevels.resistance) lines.push(`Níveis: suporte ${r.keyLevels.support ? `US$ ${r.keyLevels.support.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : "—"} · resistência ${r.keyLevels.resistance ? `US$ ${r.keyLevels.resistance.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : "—"}.`);
    if (ta?.patterns?.length) lines.push(`Padrões ativos: ${ta.patterns.slice(0, 3).map((p) => `${p.label} (${p.confidence}%)`).join(", ")}.`);
    for (const e of r.evidence.slice(0, 3)) lines.push(`• ${e.agent.replace("-agent", "")}: ${e.detail}`);
    if (r.conflicts.length) lines.push(`⚠️ ${r.conflicts[0]!.description}`);
    if (/comprar|vender|vale a pena/.test(t)) lines.push("Eu não recomendo compra ou venda. O que posso dizer é o que os dados mostram acima; a decisão, o tamanho e o stop são seus (veja a aula de gestão de risco).");
    return {
      answer: lines.join("\n"),
      sources: [`Orquestrador multiagente · candles ${r.outputs.market?.provenance?.source ?? "mercado"} · ${new Date(r.executedAt).toLocaleTimeString("pt-BR")}`],
      suggestions: [`Abrir o gráfico de ${symbol}`, `Criar um Sentinela para ${symbol}`, "Como calcular o tamanho da posição?"],
      mode: "rules",
      data: { symbol, timeframe: tf, verdict: r.verdict, confidence: r.confidence },
    };
  }

  // ---- mercado geral / sentimento
  if (/mercado|sentimento|medo|ganancia|fear|greed|hoje|panorama/.test(t)) {
    const fg = await getFearGreed().catch(() => null);
    const btc = await analyzeAsset({ symbol: "BTC", timeframe: "1d", includeSentiment: false, useLlm: false, trigger: "api" }).catch(() => null);
    const lines: string[] = [];
    if (btc) lines.push(`BTC diário: tendência ${dirPt(btc.outputs.trend?.overall ?? btc.verdict)}, veredito ${dirPt(btc.verdict)} (confiança ${Math.round(btc.confidence)}).`);
    if (fg) lines.push(`Medo & Ganância: ${fg.data.value}/100 (${fg.data.classificationPt}). ${fg.data.value >= 75 ? "Ganância extrema é leitura contrária — cautela." : fg.data.value <= 25 ? "Medo extremo costuma coincidir com fundos — risco alto, oportunidade possível." : "Sem extremo; peso baixo na decisão."}`);
    lines.push("O Panorama tem o resumo executivo completo com derivativos, manchetes e grandes transações on-chain.");
    return { answer: lines.join("\n"), sources: ["Orquestrador (BTC 1D)", "alternative.me (F&G)"], suggestions: ["Abrir o Panorama", "Como está o ETH?", "O que é funding rate?"], mode: "rules" };
  }

  // ---- glossário de padrões
  const pattern = PATTERN_LIST.find((p) => t.includes(norm(p.label)) || t.includes(p.key.replace("_", " ")));
  if (pattern) {
    const lesson = LESSONS.find((l) => l.slug === "padroes-graficos")!;
    return {
      answer: `${pattern.label} (${dirPt(pattern.direction)}): ${pattern.description}\n\nComo o scanner usa: confiança pela aderência geométrica (proporções, simetria, recência) e alvo pelo movimento medido; altcoins contra a tendência do BTC recebem rebaixamento. ${lesson.sections[0]!.body}`,
      sources: ["Catálogo de padrões do app", "Aula 6 — Padrões gráficos"],
      suggestions: ["Escanear agora", `Quais ativos têm ${pattern.label} agora?`, "O que a confiança mede?"],
      mode: "rules",
    };
  }

  // ---- indicadores / risco / conceitos: busca nas aulas
  const STOP = new Set(["qual", "quais", "como", "para", "sobre", "isso", "esta", "esse", "essa", "onde", "quando", "porque", "tenho", "posso", "pode", "fazer", "seria", "mais", "menos", "muito"]);
  const scored = LESSONS.map((l) => {
    const hay = norm([l.title, l.summary, ...l.sections.map((s) => `${s.heading} ${s.body}`), ...l.keyPoints].join(" "));
    const words = t.split(/\W+/).filter((w) => w.length >= 4 && !STOP.has(w));
    const hits = words.filter((w) => hay.includes(w)).length;
    return { l, hits };
  }).sort((a, b) => b.hits - a.hits);
  const best = scored[0];
  if (best && best.hits >= 1 && best.hits >= Math.min(2, t.split(/\W+/).filter((w) => w.length >= 4 && !STOP.has(w)).length)) {
    const words = t.split(/\W+/).filter((w) => w.length >= 4 && !STOP.has(w));
    const section = best.l.sections.find((s) => words.some((w) => norm(`${s.heading} ${s.body}`).includes(w))) ?? best.l.sections[0]!;
    return {
      answer: `${section.heading} — ${section.body}\n\nPontos-chave da aula “${best.l.title}”: ${best.l.keyPoints.join(" ")}`,
      sources: [`Aula ${best.l.order} — ${best.l.title}`],
      suggestions: [`Abrir a aula ${best.l.order}`, best.l.practice?.label ?? "Abrir o scanner", "Como está o BTC hoje?"],
      mode: "rules",
    };
  }

  // ---- LLM opcional para perguntas fora da base
  if (options.allowLlm !== false && isLlmConfigured()) {
    const out = await completeJson({
      system: "Você é um mentor de análise técnica de criptomoedas. Responda em português do Brasil, de forma objetiva, sem prometer resultados e sem recomendar compra ou venda. Não invente preços ou dados de mercado.",
      user: message,
      schema: z.object({ answer: z.string().min(1).max(1500) }),
      maxTokens: 500,
    }).catch(() => null);
    if (out) return { answer: out.answer, sources: ["Modelo de linguagem configurado no servidor"], suggestions: ["Como está o BTC hoje?", "Tomei stop, e agora?"], mode: "llm" };
  }

  return {
    answer: "Não encontrei isso na base de conhecimento. Posso responder sobre: preço/tendência/padrões de qualquer um dos 30 ativos (ex.: “como está o ETH em 4h?”), o mercado hoje (Medo & Ganância, BTC diário), os 17 padrões gráficos, indicadores (EMA, RSI, StochRSI, MACD, Fibonacci), gestão de risco e os protocolos de mindset (“tomei stop”, “FOMO”, “euforia”, “medo de clicar”, “reset”).",
    sources: [],
    suggestions: ["Como está o BTC hoje?", "O que é uma cunha de alta?", "Tomei stop, e agora?", "Como calcular o tamanho da posição?"],
    mode: "rules",
  };
}
