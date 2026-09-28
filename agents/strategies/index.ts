import type { SentimentOutput } from "@/agents/sentiment-agent";
import { rsi, stochRsi, bollinger, macd, sma, last } from "@/lib/indicators/core";
import type { IndicatorSnapshot } from "@/lib/indicators/snapshot";
import type { PatternMatch } from "@/lib/patterns/detect";
import type { Candle, Timeframe } from "@/types/market";

/**
 * Estratégias determinísticas usadas pelos Agentes do usuário (página /agentes).
 * Cada estratégia recebe um contexto com acesso preguiçoso a candles/indicadores de vários timeframes
 * e devolve um sinal (buy/sell) com confiança 0..100 e justificativa auditável.
 *
 * As categorias/rótulos seguem o que a referência exibe publicamente; a lógica é própria.
 */
export type StrategyCategory = "technical" | "sentiment" | "cycles" | "hybrid";

export interface StrategyContext {
  symbol: string;
  timeframe: Timeframe;
  candles(tf: Timeframe): Promise<Candle[]>;
  snapshot(tf: Timeframe): Promise<IndicatorSnapshot>;
  patterns(tf: Timeframe): Promise<PatternMatch[]>;
  sentiment(): Promise<SentimentOutput | null>;
}

export interface TradePlan {
  entry: number;
  target: number | null;
  stop: number | null;
  /** potencial (%), risco (%) e relação risco/retorno */
  potentialPct: number | null;
  riskPct: number | null;
  riskReward: number | null;
}

export interface StrategySignal {
  strategy: string;
  side: "buy" | "sell";
  confidence: number;
  reason: string;
  timeframe: Timeframe;
  /** plano de trade derivado do padrão (Sentinela / padrões com alvo e stop) */
  plan?: TradePlan;
  /** estratégias/indicadores que concordam e que discordam do sinal */
  confluence?: { agree: string[]; disagree: string[] };
  /** padrão que originou o sinal */
  pattern?: { key: string; label: string; confidence: number; direction: "bullish" | "bearish" | "neutral" };
  /** contexto de mercado anexado (ex.: tendência do BTC) */
  context?: string[];
}

export interface StrategyDefinition {
  key: string;
  name: string;
  category: StrategyCategory;
  description: string;
  /** timeframes em que faz sentido (vazio = qualquer) */
  timeframes: Timeframe[];
  evaluate(ctx: StrategyContext): Promise<StrategySignal | null>;
}

const sig = (strategy: string, side: "buy" | "sell", confidence: number, reason: string, timeframe: Timeframe): StrategySignal => ({
  strategy,
  side,
  confidence: Math.max(0, Math.min(100, Math.round(confidence))),
  reason,
  timeframe,
});

function higherOf(tf: Timeframe): Timeframe {
  const map: Record<Timeframe, Timeframe> = { "5m": "1h", "15m": "1h", "30m": "4h", "1h": "4h", "4h": "1d", "1d": "1w", "1w": "1w" };
  return map[tf];
}

export const STRATEGIES: StrategyDefinition[] = [
  // ------------------------------------------------------------ Análise Técnica
  {
    key: "ema_stack_trend",
    name: "Tendência por EMAs (8/25/100)",
    category: "technical",
    description: "Compra quando EMA8 > EMA25 > EMA100 e preço acima da EMA100; venda no inverso.",
    timeframes: [],
    async evaluate(ctx) {
      const s = await ctx.snapshot(ctx.timeframe);
      const f = (v: number) => Number.isFinite(v);
      if (!f(s.ema8) || !f(s.ema25) || !f(s.ema100)) return null;
      if (s.ema8 > s.ema25 && s.ema25 > s.ema100 && s.price > s.ema100) return sig(this.key, "buy", 55 + s.trendStrength * 0.35, `EMAs empilhadas para alta; força ${s.trendStrength}`, ctx.timeframe);
      if (s.ema8 < s.ema25 && s.ema25 < s.ema100 && s.price < s.ema100)
        return sig(this.key, "sell", 55 + s.trendStrength * 0.35, `EMAs empilhadas para baixa; força ${s.trendStrength}`, ctx.timeframe);
      return null;
    },
  },
  {
    key: "rsi_reversal",
    name: "Reversão por RSI",
    category: "technical",
    description: "RSI14 saindo de sobrevenda (<30) gera compra; saindo de sobrecompra (>70) gera venda.",
    timeframes: [],
    async evaluate(ctx) {
      const c = await ctx.candles(ctx.timeframe);
      const r = rsi(
        c.map((k) => k.close),
        14,
      );
      const cur = r[r.length - 1] ?? NaN;
      const prev = r[r.length - 2] ?? NaN;
      if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
      if (prev < 30 && cur >= 30) return sig(this.key, "buy", 60 + (30 - prev), `RSI saiu de sobrevenda (${prev.toFixed(1)} → ${cur.toFixed(1)})`, ctx.timeframe);
      if (prev > 70 && cur <= 70) return sig(this.key, "sell", 60 + (prev - 70), `RSI saiu de sobrecompra (${prev.toFixed(1)} → ${cur.toFixed(1)})`, ctx.timeframe);
      return null;
    },
  },
  {
    key: "macd_cross",
    name: "Cruzamento MACD",
    category: "technical",
    description: "Histograma do MACD cruzando o zero no último candle.",
    timeframes: [],
    async evaluate(ctx) {
      const c = await ctx.candles(ctx.timeframe);
      const m = macd(c.map((k) => k.close));
      const cur = m.histogram[m.histogram.length - 1] ?? NaN;
      const prev = m.histogram[m.histogram.length - 2] ?? NaN;
      if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
      const price = c[c.length - 1]?.close ?? 1;
      const mag = Math.min(20, (Math.abs(cur) / price) * 100 * 40);
      if (prev <= 0 && cur > 0) return sig(this.key, "buy", 58 + mag, "histograma MACD cruzou acima de zero", ctx.timeframe);
      if (prev >= 0 && cur < 0) return sig(this.key, "sell", 58 + mag, "histograma MACD cruzou abaixo de zero", ctx.timeframe);
      return null;
    },
  },
  {
    key: "bollinger_squeeze_breakout",
    name: "Rompimento após compressão de Bollinger",
    category: "technical",
    description: "Largura das bandas entre as 20% menores das últimas 100 barras e fechamento fora da banda.",
    timeframes: [],
    async evaluate(ctx) {
      const c = await ctx.candles(ctx.timeframe);
      const closes = c.map((k) => k.close);
      const bb = bollinger(closes, 20, 2);
      const bw = bb.bandwidth
        .slice(-100)
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b);
      const curBw = last(bb.bandwidth);
      if (bw.length < 30 || !Number.isFinite(curBw)) return null;
      const p20 = bw[Math.floor(bw.length * 0.2)] ?? NaN;
      const prevBw = bb.bandwidth[bb.bandwidth.length - 2] ?? NaN;
      if (!(prevBw <= p20)) return null;
      const close = closes[closes.length - 1] ?? NaN;
      if (close > last(bb.upper)) return sig(this.key, "buy", 65, "fechamento acima da banda superior após compressão", ctx.timeframe);
      if (close < last(bb.lower)) return sig(this.key, "sell", 65, "fechamento abaixo da banda inferior após compressão", ctx.timeframe);
      return null;
    },
  },
  {
    key: "stochrsi_bands",
    name: "StochRSI 90/50/10",
    category: "technical",
    description: "K cruzando para cima abaixo de 10 (pullback em tendência) gera compra; cruzando para baixo acima de 90 gera venda.",
    timeframes: ["1h", "4h", "1d"],
    async evaluate(ctx) {
      const c = await ctx.candles(ctx.timeframe);
      const st = stochRsi(c.map((k) => k.close));
      const k = st.k[st.k.length - 1] ?? NaN;
      const kPrev = st.k[st.k.length - 2] ?? NaN;
      const d = st.d[st.d.length - 1] ?? NaN;
      if (![k, kPrev, d].every(Number.isFinite)) return null;
      if (kPrev < 10 && k > kPrev && k > d) return sig(this.key, "buy", 62 + (10 - kPrev) * 2, `StochRSI K ${kPrev.toFixed(1)} → ${k.toFixed(1)} cruzando D acima da banda 10`, ctx.timeframe);
      if (kPrev > 90 && k < kPrev && k < d) return sig(this.key, "sell", 62 + (kPrev - 90) * 2, `StochRSI K ${kPrev.toFixed(1)} → ${k.toFixed(1)} cruzando D abaixo da banda 90`, ctx.timeframe);
      return null;
    },
  },
  {
    key: "ema100_stochrsi",
    name: "EMA 100 + StochRSI",
    category: "technical",
    description: "Pullback até a EMA 100 (±1%) em tendência de alta com StochRSI abaixo de 20 gera compra; espelho para venda.",
    timeframes: ["1h", "4h", "1d"],
    async evaluate(ctx) {
      const s = await ctx.snapshot(ctx.timeframe);
      if (!Number.isFinite(s.ema100) || !Number.isFinite(s.stochRsi.k)) return null;
      const dist = ((s.price - s.ema100) / s.ema100) * 100;
      if (s.trend === "bullish" && Math.abs(dist) <= 1 && s.stochRsi.k < 20)
        return sig(this.key, "buy", 68 + (20 - s.stochRsi.k), `preço a ${dist.toFixed(2)}% da EMA100 com StochRSI ${s.stochRsi.k}`, ctx.timeframe);
      if (s.trend === "bearish" && Math.abs(dist) <= 1 && s.stochRsi.k > 80)
        return sig(this.key, "sell", 68 + (s.stochRsi.k - 80), `preço a ${dist.toFixed(2)}% da EMA100 com StochRSI ${s.stochRsi.k}`, ctx.timeframe);
      return null;
    },
  },
  {
    key: "pattern_breakout",
    name: "Padrão gráfico confirmado",
    category: "technical",
    description: "Padrão do scanner com confiança ≥ 70 e direção definida.",
    timeframes: [],
    async evaluate(ctx) {
      const ps = await ctx.patterns(ctx.timeframe);
      const p = ps.find((x) => x.confidence >= 70 && x.direction !== "neutral");
      if (!p) return null;
      return sig(this.key, p.direction === "bullish" ? "buy" : "sell", p.confidence, `${p.label}: ${p.summary}`, ctx.timeframe);
    },
  },
  {
    key: "volume_spike",
    name: "Pico de volume direcional",
    category: "technical",
    description: "Volume relativo ≥ 2,5× a média com candle direcional.",
    timeframes: [],
    async evaluate(ctx) {
      const c = await ctx.candles(ctx.timeframe);
      const s = await ctx.snapshot(ctx.timeframe);
      const lastC = c[c.length - 1];
      if (!lastC || !(s.relativeVolume >= 2.5)) return null;
      const chg = ((lastC.close - lastC.open) / lastC.open) * 100;
      if (chg > 0.3) return sig(this.key, "buy", 55 + Math.min(20, s.relativeVolume * 4), `volume ${s.relativeVolume}× com candle +${chg.toFixed(2)}%`, ctx.timeframe);
      if (chg < -0.3) return sig(this.key, "sell", 55 + Math.min(20, s.relativeVolume * 4), `volume ${s.relativeVolume}× com candle ${chg.toFixed(2)}%`, ctx.timeframe);
      return null;
    },
  },
  // ------------------------------------------------------------ Sentimento
  {
    key: "fear_greed_extremes",
    name: "Extremos de Medo & Ganância",
    category: "sentiment",
    description: "Contrarian: índice ≤ 20 favorece compra; ≥ 80 favorece venda (fonte alternative.me).",
    timeframes: ["4h", "1d", "1w"],
    async evaluate(ctx) {
      const st = await ctx.sentiment();
      const fg = st?.fearGreed;
      if (!fg) return null;
      if (fg.value <= 20) return sig(this.key, "buy", 55 + (20 - fg.value) * 1.5, `Medo & Ganância ${fg.value} (${fg.classificationPt})`, ctx.timeframe);
      if (fg.value >= 80) return sig(this.key, "sell", 55 + (fg.value - 80) * 1.5, `Medo & Ganância ${fg.value} (${fg.classificationPt})`, ctx.timeframe);
      return null;
    },
  },
  {
    key: "news_momentum",
    name: "Momentum de notícias",
    category: "sentiment",
    description: "Média das manchetes ≥ 0,4 com tendência de alta gera compra; ≤ −0,4 com tendência de baixa gera venda.",
    timeframes: [],
    async evaluate(ctx) {
      const st = await ctx.sentiment();
      if (!st || st.newsScore === null) return null;
      const s = await ctx.snapshot(ctx.timeframe);
      if (st.newsScore >= 0.4 && s.trend !== "bearish") return sig(this.key, "buy", 50 + st.newsScore * 40, `manchetes ${st.newsScore} (${st.newsMethod}) com tendência ${s.trend}`, ctx.timeframe);
      if (st.newsScore <= -0.4 && s.trend !== "bullish")
        return sig(this.key, "sell", 50 + Math.abs(st.newsScore) * 40, `manchetes ${st.newsScore} (${st.newsMethod}) com tendência ${s.trend}`, ctx.timeframe);
      return null;
    },
  },
  // ------------------------------------------------------------ Ciclos
  {
    key: "weekly_cycle",
    name: "Ciclo semanal (SMA 20 semanas)",
    category: "cycles",
    description: "Cruzamento do fechamento semanal com a média de 20 semanas.",
    timeframes: ["1d", "1w"],
    async evaluate(ctx) {
      const w = await ctx.candles("1w");
      const closes = w.map((k) => k.close);
      const s20 = sma(closes, 20);
      const cur = closes[closes.length - 1] ?? NaN;
      const prev = closes[closes.length - 2] ?? NaN;
      const m = s20[s20.length - 1] ?? NaN;
      const mPrev = s20[s20.length - 2] ?? NaN;
      if (![cur, prev, m, mPrev].every(Number.isFinite)) return null;
      if (prev <= mPrev && cur > m) return sig(this.key, "buy", 66, "fechamento semanal cruzou acima da SMA 20 semanas", "1w");
      if (prev >= mPrev && cur < m) return sig(this.key, "sell", 66, "fechamento semanal cruzou abaixo da SMA 20 semanas", "1w");
      return null;
    },
  },
  {
    key: "mean_reversion",
    name: "Reversão à média (Bollinger + RSI)",
    category: "cycles",
    description: "%B < 0 com RSI < 35 gera compra; %B > 1 com RSI > 65 gera venda.",
    timeframes: [],
    async evaluate(ctx) {
      const s = await ctx.snapshot(ctx.timeframe);
      if (!Number.isFinite(s.bollinger.percentB) || !Number.isFinite(s.rsi14)) return null;
      if (s.bollinger.percentB < 0 && s.rsi14 < 35) return sig(this.key, "buy", 60 + (35 - s.rsi14), `%B ${s.bollinger.percentB} e RSI ${s.rsi14}`, ctx.timeframe);
      if (s.bollinger.percentB > 1 && s.rsi14 > 65) return sig(this.key, "sell", 60 + (s.rsi14 - 65), `%B ${s.bollinger.percentB} e RSI ${s.rsi14}`, ctx.timeframe);
      return null;
    },
  },
  // ------------------------------------------------------------ Híbridas
  {
    key: "daytrade_multi_tf",
    name: "Day Trade 1D · 4H · 1H",
    category: "hybrid",
    description: "Tendência primária (1D) e secundária (4H) alinhadas; refinamento por StochRSI no 1H.",
    timeframes: ["1h", "4h"],
    async evaluate(ctx) {
      const [d, h4, h1] = await Promise.all([ctx.snapshot("1d"), ctx.snapshot("4h"), ctx.snapshot("1h")]);
      if (d.trend === "bullish" && h4.trend === "bullish" && h1.stochRsi.k < 25)
        return sig(this.key, "buy", 60 + (d.trendStrength + h4.trendStrength) / 8, `1D e 4H de alta; StochRSI 1H ${h1.stochRsi.k}`, "1h");
      if (d.trend === "bearish" && h4.trend === "bearish" && h1.stochRsi.k > 75)
        return sig(this.key, "sell", 60 + (d.trendStrength + h4.trendStrength) / 8, `1D e 4H de baixa; StochRSI 1H ${h1.stochRsi.k}`, "1h");
      return null;
    },
  },
  {
    key: "swing_multi_tf",
    name: "Swing Trade 1W · 1D · 4H",
    category: "hybrid",
    description: "Tendência semanal e diária alinhadas; entrada no recuo à EMA 25 do 4H.",
    timeframes: ["4h", "1d"],
    async evaluate(ctx) {
      const [w, d, h4] = await Promise.all([ctx.snapshot("1w"), ctx.snapshot("1d"), ctx.snapshot("4h")]);
      const dist = Number.isFinite(h4.ema25) ? ((h4.price - h4.ema25) / h4.ema25) * 100 : NaN;
      if (w.trend === "bullish" && d.trend === "bullish" && Number.isFinite(dist) && Math.abs(dist) <= 1.5)
        return sig(this.key, "buy", 62 + (w.trendStrength + d.trendStrength) / 8, `1W e 1D de alta; preço a ${dist.toFixed(2)}% da EMA25 4H`, "4h");
      if (w.trend === "bearish" && d.trend === "bearish" && Number.isFinite(dist) && Math.abs(dist) <= 1.5)
        return sig(this.key, "sell", 62 + (w.trendStrength + d.trendStrength) / 8, `1W e 1D de baixa; preço a ${dist.toFixed(2)}% da EMA25 4H`, "4h");
      return null;
    },
  },
  {
    key: "sentinel_patterns",
    name: "Sentinela multipadrão (todos os padrões + confluência)",
    category: "hybrid",
    description: "Vigia os 17 padrões gráficos ao mesmo tempo; para o melhor padrão calcula plano de trade (entrada, alvo, stop, risco/retorno) e confluência com EMAs, RSI, StochRSI, MACD e tendência do timeframe superior.",
    timeframes: [],
    async evaluate(ctx) {
      const [patterns, s, h] = await Promise.all([ctx.patterns(ctx.timeframe), ctx.snapshot(ctx.timeframe), ctx.snapshot(higherOf(ctx.timeframe))]);
      const best = patterns.filter((p) => p.direction !== "neutral").sort((a, b) => b.confidence - a.confidence)[0];
      if (!best) return null;
      const side: "buy" | "sell" = best.direction === "bullish" ? "buy" : "sell";
      const agree: string[] = [];
      const disagree: string[] = [];
      const vote = (name: string, dir: "bullish" | "bearish" | "neutral") => {
        if (dir === "neutral") return;
        (dir === best.direction ? agree : disagree).push(name);
      };
      vote(`tendência ${ctx.timeframe} (${s.trendStrength})`, s.trend);
      vote(`tendência ${higherOf(ctx.timeframe)} (${h.trendStrength})`, h.trend);
      if (Number.isFinite(s.ema8) && Number.isFinite(s.ema25)) vote("EMA 8 × 25", s.ema8 > s.ema25 ? "bullish" : "bearish");
      if (Number.isFinite(s.ema100)) vote("preço × EMA 100", s.price > s.ema100 ? "bullish" : "bearish");
      if (Number.isFinite(s.rsi14)) vote(`RSI ${s.rsi14.toFixed(0)}`, s.rsi14 >= 55 ? "bullish" : s.rsi14 <= 45 ? "bearish" : "neutral");
      if (Number.isFinite(s.stochRsi.k)) vote(`StochRSI ${s.stochRsi.k.toFixed(0)}`, s.stochRsi.k <= 20 ? "bullish" : s.stochRsi.k >= 80 ? "bearish" : "neutral");
      if (Number.isFinite(s.macd.histogram)) vote("histograma MACD", s.macd.histogram > 0 ? "bullish" : "bearish");
      if (Number.isFinite(s.relativeVolume) && s.relativeVolume >= 1.5) agree.push(`volume relativo ${s.relativeVolume.toFixed(1)}×`);
      const confidence = best.confidence + Math.min(12, agree.length * 3) - disagree.length * 4;
      const entry = best.price;
      const potentialPct = best.target ? (Math.abs(best.target - entry) / entry) * 100 : null;
      const riskPct = best.stop ? (Math.abs(entry - best.stop) / entry) * 100 : null;
      const plan: TradePlan = {
        entry,
        target: best.target,
        stop: best.stop,
        potentialPct: potentialPct === null ? null : Math.round(potentialPct * 100) / 100,
        riskPct: riskPct === null ? null : Math.round(riskPct * 100) / 100,
        riskReward: potentialPct !== null && riskPct ? Math.round((potentialPct / riskPct) * 100) / 100 : null,
      };
      const others = patterns.filter((p) => p !== best).map((p) => `${p.label} (${p.confidence})`);
      const context = [...(best.context ? [best.context.note] : []), ...(others.length ? [`Outros padrões ativos: ${others.join(", ")}`] : [])];
      return {
        ...sig(this.key, side, confidence, `${best.label} (${best.confidence}) · ${best.summary} Confluência: ${agree.length} a favor, ${disagree.length} contra.`, ctx.timeframe),
        plan,
        confluence: { agree, disagree },
        pattern: { key: best.key, label: best.label, confidence: best.confidence, direction: best.direction },
        context,
      };
    },
  },
  {
    key: "confluence",
    name: "Confluência técnica + tendência superior",
    category: "hybrid",
    description: "Viés técnico do timeframe e tendência do timeframe superior na mesma direção com força ≥ 50.",
    timeframes: [],
    async evaluate(ctx) {
      const [s, h] = await Promise.all([ctx.snapshot(ctx.timeframe), ctx.snapshot(higherOf(ctx.timeframe))]);
      if (s.trend !== "neutral" && s.trend === h.trend && s.trendStrength >= 50 && h.trendStrength >= 50)
        return sig(
          this.key,
          s.trend === "bullish" ? "buy" : "sell",
          55 + (s.trendStrength + h.trendStrength) / 5,
          `${ctx.timeframe} e ${higherOf(ctx.timeframe)} ${s.trend} (forças ${s.trendStrength}/${h.trendStrength})`,
          ctx.timeframe,
        );
      return null;
    },
  },
];

const BY_KEY = new Map(STRATEGIES.map((s) => [s.key, s]));

export function listStrategies() {
  return STRATEGIES.map(({ key, name, category, description, timeframes }) => ({ key, name, category, description, timeframes }));
}

/** Avalia um conjunto de estratégias; erros individuais não interrompem as demais. */
export async function evaluateStrategies(keys: readonly string[], ctx: StrategyContext): Promise<{ signals: StrategySignal[]; errors: Array<{ strategy: string; error: string }> }> {
  const signals: StrategySignal[] = [];
  const errors: Array<{ strategy: string; error: string }> = [];
  for (const key of keys) {
    const def = BY_KEY.get(key);
    if (!def) {
      errors.push({ strategy: key, error: "estratégia desconhecida" });
      continue;
    }
    try {
      const s = await def.evaluate(ctx);
      if (s) signals.push(s);
    } catch (err) {
      errors.push({ strategy: key, error: (err as Error).message });
    }
  }
  return { signals, errors };
}

/** Contexto padrão com memoização por timeframe. */
export function createStrategyContext(deps: {
  symbol: string;
  timeframe: Timeframe;
  getCandles(symbol: string, tf: Timeframe): Promise<Candle[]>;
  snapshot(candles: readonly Candle[]): IndicatorSnapshot;
  detectPatterns(candles: readonly Candle[]): PatternMatch[];
  getSentiment(symbol: string): Promise<SentimentOutput | null>;
}): StrategyContext {
  const candleCache = new Map<Timeframe, Promise<Candle[]>>();
  const snapCache = new Map<Timeframe, Promise<IndicatorSnapshot>>();
  const patCache = new Map<Timeframe, Promise<PatternMatch[]>>();
  let sent: Promise<SentimentOutput | null> | null = null;
  const candles = (tf: Timeframe) => {
    let p = candleCache.get(tf);
    if (!p) {
      p = deps.getCandles(deps.symbol, tf);
      candleCache.set(tf, p);
    }
    return p;
  };
  return {
    symbol: deps.symbol,
    timeframe: deps.timeframe,
    candles,
    snapshot(tf) {
      let p = snapCache.get(tf);
      if (!p) {
        p = candles(tf).then((c) => deps.snapshot(c));
        snapCache.set(tf, p);
      }
      return p;
    },
    patterns(tf) {
      let p = patCache.get(tf);
      if (!p) {
        p = candles(tf).then((c) => deps.detectPatterns(c));
        patCache.set(tf, p);
      }
      return p;
    },
    sentiment() {
      if (!sent) sent = deps.getSentiment(deps.symbol);
      return sent;
    },
  };
}
