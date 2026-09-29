import type { Candle } from "@/types/market";
import { atr } from "@/lib/indicators/core";
import type { Swing } from "@/lib/engines/structure";

/**
 * Liquidity Engine.
 *
 * Pools = níveis onde se acumulam ordens de stop: topos/fundos iguais (EQH/EQL), máxima/mínima do dia
 * e da semana anteriores (UTC), e swings externos ainda não tomados.
 * Estado de cada pool avaliado com os candles POSTERIORES à sua formação:
 *  - swept: pavio além do nível e fechamento de volta (liquidez capturada, sem aceitação);
 *  - broken: fechamento além do nível (aceitação; o nível deixa de ser alvo);
 *  - available: intocado.
 * BSL (buy-side) = pools acima do preço; SSL (sell-side) = abaixo.
 */

export type PoolKind = "EQH" | "EQL" | "PDH" | "PDL" | "PWH" | "PWL" | "SWING_HIGH" | "SWING_LOW";
export type PoolState = "available" | "swept" | "broken";

export interface LiquidityPool {
  kind: PoolKind;
  price: number;
  side: "BSL" | "SSL";
  /** barra (na série analisada) a partir da qual o nível existe */
  formedIndex: number;
  formedTime: number;
  state: PoolState;
  /** barra da captura/rompimento */
  eventIndex: number | null;
  eventTime: number | null;
  /** distância do último fechamento até o nível, em ATR (positivo = acima) */
  distanceAtr: number;
  distancePct: number;
  /** nº de swings que compõem o nível (EQH/EQL ≥ 2) */
  touches: number;
}

export interface LiquiditySweep {
  kind: PoolKind;
  price: number;
  direction: "bullish" | "bearish"; // varreu SSL e voltou = bullish; varreu BSL e voltou = bearish
  index: number;
  time: number;
  barsAgo: number;
}

export interface LiquidityMap {
  pools: LiquidityPool[];
  /** pools disponíveis mais próximos acima/abaixo */
  nearestAbove: LiquidityPool | null;
  nearestBelow: LiquidityPool | null;
  /** capturas recentes (últimas `recentBars` barras) */
  recentSweeps: LiquiditySweep[];
  availableAbove: number;
  availableBelow: number;
  atr: number;
}

export interface LiquidityOptions {
  /** tolerância para topos/fundos iguais, em ATR */
  equalTolAtr?: number;
  /** janela de swings considerada para EQH/EQL */
  lookbackSwings?: number;
  recentBars?: number;
  /** candles diários e semanais FECHADOS (UTC) para PDH/PDL/PWH/PWL */
  daily?: readonly Candle[];
  weekly?: readonly Candle[];
}

function evaluate(candles: readonly Candle[], price: number, side: "BSL" | "SSL", from: number): { state: PoolState; index: number | null } {
  for (let j = from; j < candles.length; j++) {
    const c = candles[j] as Candle;
    if (side === "BSL") {
      if (c.close > price) return { state: "broken", index: j };
      if (c.high > price) return { state: "swept", index: j };
    } else {
      if (c.close < price) return { state: "broken", index: j };
      if (c.low < price) return { state: "swept", index: j };
    }
  }
  return { state: "available", index: null };
}

/** Primeira barra da série cujo openTime é ≥ t. */
function indexAtOrAfter(candles: readonly Candle[], t: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((candles[mid] as Candle).openTime < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function buildLiquidityMap(candles: readonly Candle[], swings: readonly Swing[], options: LiquidityOptions = {}): LiquidityMap {
  const tol = options.equalTolAtr ?? 0.1;
  const lookback = options.lookbackSwings ?? 20;
  const recentBars = options.recentBars ?? 10;
  const a = atr(candles, 14);
  const lastAtrRaw = a[a.length - 1];
  const lastAtr = Number.isFinite(lastAtrRaw) ? (lastAtrRaw as number) : NaN;
  const close = candles[candles.length - 1]?.close ?? NaN;
  const pools: LiquidityPool[] = [];

  const add = (kind: PoolKind, price: number, formedIndex: number, touches: number) => {
    if (!Number.isFinite(price) || formedIndex >= candles.length) return;
    const side: "BSL" | "SSL" = kind === "EQH" || kind === "PDH" || kind === "PWH" || kind === "SWING_HIGH" ? "BSL" : "SSL";
    const ev = evaluate(candles, price, side, formedIndex + 1);
    const ft = (candles[Math.max(0, formedIndex)] as Candle).openTime;
    pools.push({
      kind,
      price,
      side,
      formedIndex,
      formedTime: ft,
      state: ev.state,
      eventIndex: ev.index,
      eventTime: ev.index != null ? (candles[ev.index] as Candle).openTime : null,
      distanceAtr: Number.isFinite(lastAtr) && lastAtr > 0 ? (price - close) / lastAtr : NaN,
      distancePct: ((price - close) / close) * 100,
      touches,
    });
  };

  // EQH / EQL: pares de swings do mesmo tipo dentro da tolerância (usa o ATR na formação do segundo)
  const recent = swings.slice(-lookback);
  const used = new Set<number>();
  for (let i = 0; i < recent.length; i++) {
    const s1 = recent[i] as Swing;
    if (used.has(s1.index)) continue;
    const group = [s1];
    for (let j = i + 1; j < recent.length; j++) {
      const s2 = recent[j] as Swing;
      if (s2.kind !== s1.kind || used.has(s2.index)) continue;
      const atrAt = a[s2.index];
      const t = Number.isFinite(atrAt) ? tol * (atrAt as number) : 0;
      if (Math.abs(s2.price - s1.price) <= t) group.push(s2);
    }
    if (group.length >= 2) {
      for (const g of group) used.add(g.index);
      const lastG = group[group.length - 1] as Swing;
      const price = s1.kind === "high" ? Math.max(...group.map((g) => g.price)) : Math.min(...group.map((g) => g.price));
      add(s1.kind === "high" ? "EQH" : "EQL", price, lastG.confirmedAt, group.length);
    }
  }

  // swings externos isolados (os 3 mais recentes de cada lado que não viraram EQH/EQL)
  for (const kind of ["high", "low"] as const) {
    const list = swings.filter((s) => s.kind === kind && !used.has(s.index)).slice(-3);
    for (const s of list) add(kind === "high" ? "SWING_HIGH" : "SWING_LOW", s.price, s.confirmedAt, 1);
  }

  // Dia/semana anteriores (UTC): último candle FECHADO da série diária/semanal
  const periodLevel = (series: readonly Candle[] | undefined, hiKind: PoolKind, loKind: PoolKind) => {
    const prev = series?.[series.length - 1];
    if (!prev || candles.length === 0) return;
    // o nível passa a existir quando o período termina
    const idx = indexAtOrAfter(candles, prev.closeTime + 1);
    if (idx >= candles.length) return;
    add(hiKind, prev.high, idx - 1, 1);
    add(loKind, prev.low, idx - 1, 1);
  };
  periodLevel(options.daily, "PDH", "PDL");
  periodLevel(options.weekly, "PWH", "PWL");

  const lastIndex = candles.length - 1;
  const recentSweeps: LiquiditySweep[] = pools
    .filter((p) => p.state === "swept" && p.eventIndex != null && lastIndex - (p.eventIndex as number) < recentBars)
    .map((p) => ({
      kind: p.kind,
      price: p.price,
      direction: p.side === "SSL" ? ("bullish" as const) : ("bearish" as const),
      index: p.eventIndex as number,
      time: p.eventTime as number,
      barsAgo: lastIndex - (p.eventIndex as number),
    }))
    .sort((x, y) => x.barsAgo - y.barsAgo);

  const available = pools.filter((p) => p.state === "available");
  const above = available.filter((p) => p.price > close).sort((x, y) => x.price - y.price);
  const below = available.filter((p) => p.price < close).sort((x, y) => y.price - x.price);
  pools.sort((x, y) => Math.abs(x.distanceAtr) - Math.abs(y.distanceAtr));
  return {
    pools,
    nearestAbove: above[0] ?? null,
    nearestBelow: below[0] ?? null,
    recentSweeps,
    availableAbove: above.length,
    availableBelow: below.length,
    atr: lastAtr,
  };
}
