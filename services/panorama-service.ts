import { cached } from "@/lib/cache";
import { ASSETS } from "@/lib/assets";
import { computeSnapshot } from "@/lib/indicators/snapshot";
import { round } from "@/lib/indicators/core";
import { createLogger } from "@/lib/logger";
import { getCandles, getGlobalMarket, getTickers, getUsdBrl } from "@/services/market/market-service";
import { getDerivativesSnapshot, type DerivativesSnapshot } from "@/services/market/providers/binance-futures";
import { getFearGreed } from "@/services/sentiment/fear-greed";
import { getNews } from "@/services/sentiment/news";
import type { Direction } from "@/types/market";

const log = createLogger("panorama");

export interface PanoramaFactor {
  title: string;
  bias: "bullish" | "neutral" | "bearish";
  detail: string;
  source: string;
}

export interface PanoramaReport {
  generatedAt: number;
  btc: {
    price: number;
    changePct24h: number | null;
    trend1d: Direction;
    trendStrength: number;
    rsi14: number | null;
    support: number | null;
    resistance: number | null;
    volatilityPct: number | null;
    source: string;
  } | null;
  fearGreed: { value: number; classificationPt: string; timestamp: number; weekAvg: number | null } | null;
  global: { totalMarketCapUsd: number | null; changePct24h: number | null; btcDominance: number | null; ethDominance: number | null; volume24hUsd: number | null; stale: boolean } | null;
  /** fase do ciclo inferida por regras determinísticas (EMA200 diária, RSI, distância do topo de 200 dias) */
  cycle: { label: string; detail: string };
  derivatives: { items: DerivativesSnapshot[]; error: string | null };
  news: { positive: number; negative: number; neutral: number; top: Array<{ title: string; source: string; link: string; score: number | null; publishedAt: number }> } | null;
  summary: string[];
  factors: PanoramaFactor[];
  bias: Direction;
  usdBrl: number | null;
  /** o que não pôde ser obtido de fonte pública nesta implementação */
  notAvailable: string[];
}

const DERIVATIVE_SYMBOLS = ["BTC", "ETH", "SOL"] as const;

function fmtUsd(n: number): string {
  return n >= 1000 ? `US$ ${Math.round(n).toLocaleString("pt-BR")}` : `US$ ${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

async function buildReport(): Promise<PanoramaReport> {
  const notAvailable: string[] = [];
  const [tickersRes, globalRes, fng, fx, newsRes, candles1d] = await Promise.all([
    getTickers().catch(() => null),
    getGlobalMarket(),
    getFearGreed().catch(() => null),
    getUsdBrl(),
    getNews().catch(() => null),
    getCandles("BTC", "1d", { limit: 300 }).catch(() => null),
  ]);
  const derivativeResults = await Promise.all(
    DERIVATIVE_SYMBOLS.map(async (s) => {
      const asset = ASSETS.find((a) => a.symbol === s);
      if (!asset) return { ok: false as const, error: `ativo ${s} desconhecido` };
      try {
        return { ok: true as const, value: await getDerivativesSnapshot(s, asset.binancePair) };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    }),
  );
  const derivatives = derivativeResults.flatMap((r) => (r.ok ? [r.value] : []));
  const derivativesError = derivatives.length === 0 ? (derivativeResults.find((r) => !r.ok)?.error ?? "indisponível") : null;
  if (derivativesError) notAvailable.push(`Derivativos (Binance Futures): ${derivativesError}`);
  notAvailable.push("Rotulagem de carteiras de corretoras (entradas/saídas de exchange) e reservas em custódia: só em serviços pagos (Coinglass/Whale Alert). As grandes transações on-chain são mostradas sem rótulo.");

  const btcTicker = tickersRes?.tickers.find((t) => t.symbol === "BTC") ?? null;
  const snap = candles1d && candles1d.candles.length >= 30 ? computeSnapshot(candles1d.candles) : null;
  const btc = snap
    ? {
        price: btcTicker?.price ?? snap.price,
        changePct24h: btcTicker ? round(btcTicker.changePct24h, 2) : null,
        trend1d: snap.trend,
        trendStrength: snap.trendStrength,
        rsi14: Number.isFinite(snap.rsi14) ? snap.rsi14 : null,
        support: snap.supports[0]?.price ?? null,
        resistance: snap.resistances[0]?.price ?? null,
        volatilityPct: Number.isFinite(snap.volatilityPct) ? snap.volatilityPct : null,
        source: candles1d?.source ?? "—",
      }
    : null;

  const g = globalRes?.data ?? null;
  const global = g
    ? {
        totalMarketCapUsd: g.total_market_cap.usd ?? null,
        changePct24h: Number.isFinite(g.market_cap_change_percentage_24h_usd) ? round(g.market_cap_change_percentage_24h_usd, 2) : null,
        btcDominance: g.market_cap_percentage.btc ?? null,
        ethDominance: g.market_cap_percentage.eth ?? null,
        volume24hUsd: g.total_volume.usd ?? null,
        stale: globalRes?.stale ?? false,
      }
    : null;

  const fear = fng
    ? {
        value: fng.data.value,
        classificationPt: fng.data.classificationPt,
        timestamp: fng.data.timestamp,
        weekAvg: fng.data.history.length ? round(fng.data.history.slice(0, 7).reduce((a, b) => a + b.value, 0) / Math.min(7, fng.data.history.length), 0) : null,
      }
    : null;

  // ---- Ciclo (regras: preço vs EMA200 diária, RSI diário, distância do topo de 200 dias)
  let cycle = { label: "Indeterminado", detail: "Sem candles diários suficientes para inferir a fase do ciclo." };
  if (snap && candles1d) {
    const closes = candles1d.candles.map((c) => c.close);
    const top200 = Math.max(...closes.slice(-200));
    const low200 = Math.min(...closes.slice(-200));
    const drawdown = ((snap.price - top200) / top200) * 100;
    const fromLow = ((snap.price - low200) / low200) * 100;
    const aboveEma200 = Number.isFinite(snap.ema200) && snap.price > snap.ema200;
    if (aboveEma200 && drawdown > -8 && snap.rsi14 >= 60) cycle = { label: "Expansão / euforia", detail: `Preço acima da EMA200 diária, a ${fmtPct(drawdown)} do topo de 200 dias e RSI ${snap.rsi14.toFixed(0)}.` };
    else if (aboveEma200 && drawdown > -20) cycle = { label: "Tendência de alta com correção", detail: `Acima da EMA200 diária; ${fmtPct(drawdown)} do topo de 200 dias.` };
    else if (aboveEma200) cycle = { label: "Re-acumulação", detail: `Acima da EMA200 diária, mas ${fmtPct(drawdown)} do topo de 200 dias.` };
    else if (!aboveEma200 && fromLow < 15) cycle = { label: "Capitulação / fundo em teste", detail: `Abaixo da EMA200 diária e apenas ${fmtPct(fromLow)} acima do fundo de 200 dias.` };
    else cycle = { label: "Distribuição / baixa", detail: `Abaixo da EMA200 diária; ${fmtPct(drawdown)} do topo e ${fmtPct(fromLow)} acima do fundo de 200 dias.` };
  }

  // ---- Fatores
  const factors: PanoramaFactor[] = [];
  if (btc) {
    const bias: PanoramaFactor["bias"] = btc.trend1d === "bullish" ? "bullish" : btc.trend1d === "bearish" ? "bearish" : "neutral";
    factors.push({
      title: `Estrutura técnica do BTC (1D): tendência ${btc.trend1d === "bullish" ? "de alta" : btc.trend1d === "bearish" ? "de baixa" : "neutra"} (${btc.trendStrength}/100)`,
      bias,
      detail: `Preço ${fmtUsd(btc.price)}${btc.changePct24h !== null ? `, ${fmtPct(btc.changePct24h)} em 24 h` : ""}; RSI(14) ${btc.rsi14?.toFixed(0) ?? "—"}; suporte ${btc.support ? fmtUsd(btc.support) : "—"} e resistência ${btc.resistance ? fmtUsd(btc.resistance) : "—"} pelos pivôs diários.`,
      source: `candles ${btc.source}`,
    });
  }
  if (fear) {
    const bias: PanoramaFactor["bias"] = fear.value >= 75 ? "bearish" : fear.value <= 25 ? "bullish" : fear.value >= 55 ? "bullish" : fear.value <= 45 ? "bearish" : "neutral";
    factors.push({
      title: `Medo & Ganância: ${fear.value}/100 (${fear.classificationPt})`,
      bias,
      detail:
        fear.value >= 75
          ? "Ganância extrema historicamente precede correções; leitura contrária (risco de exaustão compradora)."
          : fear.value <= 25
            ? "Medo extremo costuma coincidir com fundos de curto prazo; leitura contrária (oportunidade com risco)."
            : `Média dos últimos 7 dias: ${fear.weekAvg ?? "—"}. Sentimento sem extremo; peso baixo na decisão.`,
      source: "alternative.me",
    });
  }
  if (global && global.changePct24h !== null) {
    factors.push({
      title: `Capitalização total ${fmtPct(global.changePct24h)} em 24 h · dominância BTC ${global.btcDominance?.toFixed(1) ?? "—"}%`,
      bias: global.changePct24h > 1 ? "bullish" : global.changePct24h < -1 ? "bearish" : "neutral",
      detail: `${global.totalMarketCapUsd ? `Cap. ${fmtUsd(global.totalMarketCapUsd)}` : ""}${global.volume24hUsd ? `, volume 24 h ${fmtUsd(global.volume24hUsd)}` : ""}. Dominância alta do BTC indica fluxo concentrado; queda de dominância com mercado subindo favorece altcoins.`,
      source: "CoinGecko",
    });
  }
  const btcDer = derivatives.find((d) => d.symbol === "BTC");
  if (btcDer) {
    const fr = btcDer.fundingRate * 100;
    const ls = btcDer.longShortRatio;
    const taker = btcDer.takerBuySellRatio;
    const crowdedLong = fr > 0.03 || (ls !== null && ls > 1.8);
    const crowdedShort = fr < -0.01 || (ls !== null && ls < 0.7);
    factors.push({
      title: `Derivativos BTC: funding ${fr.toFixed(4)}% · long/short ${ls?.toFixed(2) ?? "—"} · taker compra/venda ${taker?.toFixed(2) ?? "—"}`,
      bias: crowdedLong ? "bearish" : crowdedShort ? "bullish" : taker !== null && taker > 1.05 ? "bullish" : taker !== null && taker < 0.95 ? "bearish" : "neutral",
      detail: `${crowdedLong ? "Posicionamento comprado lotado (risco de liquidação em cascata para baixo). " : crowdedShort ? "Posicionamento vendido lotado (risco de short squeeze). " : "Alavancagem equilibrada. "}Open interest ${btcDer.openInterestUsd ? fmtUsd(btcDer.openInterestUsd) : `${btcDer.openInterest.toFixed(0)} BTC`}${btcDer.openInterestChange24hPct !== null ? ` (${fmtPct(btcDer.openInterestChange24hPct)} em 24 h)` : ""}.`,
      source: "Binance Futures (público)",
    });
  }
  if (newsRes) {
    const scored = newsRes.items.filter((n) => n.score !== null);
    const positive = scored.filter((n) => (n.score ?? 0) > 0.1).length;
    const negative = scored.filter((n) => (n.score ?? 0) < -0.1).length;
    const neutral = newsRes.items.length - positive - negative;
    factors.push({
      title: `Manchetes (${newsRes.items.length}): ${positive} positivas · ${negative} negativas · ${neutral} neutras`,
      bias: positive > negative * 1.5 && positive >= 3 ? "bullish" : negative > positive * 1.5 && negative >= 3 ? "bearish" : "neutral",
      detail: "Pontuação por léxico determinístico (termos casados são auditáveis); sinal fraco, usado só como contexto.",
      source: "RSS Cointelegraph / CoinDesk",
    });
  }

  // ---- Viés consolidado e resumo
  const score = factors.reduce((acc, f) => acc + (f.bias === "bullish" ? 1 : f.bias === "bearish" ? -1 : 0), 0);
  const bias: Direction = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
  const summary: string[] = [];
  if (btc) {
    summary.push(
      `O Bitcoin negocia a ${fmtUsd(btc.price)}${btc.changePct24h !== null ? ` (${fmtPct(btc.changePct24h)} em 24 h)` : ""}, em tendência diária ${btc.trend1d === "bullish" ? "de alta" : btc.trend1d === "bearish" ? "de baixa" : "neutra"} com força ${btc.trendStrength}/100; fase do ciclo inferida: ${cycle.label.toLowerCase()}.`,
    );
    if (btc.support && btc.resistance) summary.push(`Níveis a observar: suporte em ${fmtUsd(btc.support)} e resistência em ${fmtUsd(btc.resistance)} (pivôs do gráfico diário)${btc.volatilityPct !== null ? `; volatilidade histórica de ${btc.volatilityPct.toFixed(2)}% ao dia` : ""}.`);
  } else {
    summary.push("Candles diários do BTC indisponíveis no momento; o relatório usa apenas as fontes que responderam.");
  }
  if (fear) summary.push(`Sentimento: Medo & Ganância em ${fear.value} (${fear.classificationPt})${fear.weekAvg !== null ? `, média semanal ${fear.weekAvg}` : ""}.`);
  if (global && global.changePct24h !== null) summary.push(`Mercado total ${fmtPct(global.changePct24h)} em 24 h, dominância do BTC em ${global.btcDominance?.toFixed(1) ?? "—"}%.`);
  if (btcDer) summary.push(`Derivativos: funding de ${(btcDer.fundingRate * 100).toFixed(4)}% e ${btcDer.longAccountPct !== null ? `${btcDer.longAccountPct.toFixed(1)}% das contas compradas` : "proporção long/short indisponível"} na Binance Futures.`);
  summary.push(
    `Viés consolidado: ${bias === "bullish" ? "alta" : bias === "bearish" ? "baixa" : "neutro"} (${factors.filter((f) => f.bias === "bullish").length} fator(es) de alta, ${factors.filter((f) => f.bias === "bearish").length} de baixa, ${factors.filter((f) => f.bias === "neutral").length} neutro(s)). Conteúdo informativo, gerado por regras sobre dados públicos; não é recomendação de investimento.`,
  );

  return {
    generatedAt: Date.now(),
    btc,
    fearGreed: fear,
    global,
    cycle,
    derivatives: { items: derivatives, error: derivativesError },
    news: newsRes
      ? {
          positive: newsRes.items.filter((n) => (n.score ?? 0) > 0.1).length,
          negative: newsRes.items.filter((n) => (n.score ?? 0) < -0.1).length,
          neutral: newsRes.items.filter((n) => n.score === null || Math.abs(n.score) <= 0.1).length,
          top: newsRes.items.slice(0, 8).map((n) => ({ title: n.title, source: n.source, link: n.link, score: n.score, publishedAt: n.publishedAt })),
        }
      : null,
    summary,
    factors,
    bias,
    usdBrl: Number.isFinite(fx.rate) ? fx.rate : null,
    notAvailable,
  };
}

/** Relatório do Panorama com cache de 5 min (stale até 6 h se as fontes falharem). */
export async function getPanoramaReport(): Promise<{ report: PanoramaReport; stale: boolean }> {
  const res = await cached<PanoramaReport>("panorama:report", 300, buildReport, { staleTtlSeconds: 6 * 3600 });
  if (res.stale) log.warn("panorama servido de cache obsoleto");
  return { report: res.value, stale: res.stale };
}
