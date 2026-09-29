import type { Candle, Direction } from "@/types/market";
import type { StructureResult } from "@/lib/engines/structure";
import type { LiquidityMap } from "@/lib/engines/liquidity";

/**
 * Setup Engine — geometria determinística de um setup a partir de estrutura e liquidez, e máquina de
 * estados avaliada sobre candles FECHADOS (nenhuma transição manual):
 *
 *   DETECTED → FORMING → READY → TRIGGERED → ACTIVE → TARGET_HIT | INVALIDATED | EXPIRED
 *
 * Long (short espelhado):
 *  - Nível-chave = suporte mais próximo abaixo do preço entre: último fundo externo, último fundo interno,
 *    pool de liquidez abaixo e equilíbrio da faixa.
 *  - Zona de entrada = [nível, nível + 0,5 ATR] (zona, não preço exato).
 *  - Invalidação = último fundo externo abaixo da zona; stop estrutural = invalidação − 0,1 ATR.
 *  - Alvos = pools de liquidez disponíveis acima e o topo externo; completados com múltiplos de R quando faltam níveis.
 *  - Gatilho = após o preço tocar a zona, um BOS/CHoCH/MSS da estrutura interna na direção do setup.
 */

export type SetupState = "DETECTED" | "FORMING" | "READY" | "TRIGGERED" | "ACTIVE" | "TARGET_HIT" | "INVALIDATED" | "EXPIRED";

export interface SetupTarget {
  label: "TP1" | "TP2" | "TP3";
  price: number;
  r: number;
  source: string;
}

export interface SetupGeometry {
  direction: Exclude<Direction, "neutral">;
  keyLevel: { price: number; source: string };
  entryZone: { low: number; high: number };
  idealEntry: number;
  maxEntry: number;
  invalidation: { price: number; source: string };
  stop: number;
  targets: SetupTarget[];
  /** R até o TP1 a partir da entrada ideal */
  rr: number | null;
  atr: number;
}

export interface SetupEvaluation extends SetupGeometry {
  state: SetupState;
  stateReason: string;
  /**
   * Nível cujo FECHAMENTO além dele confirma o gatilho: último swing interno a favor ainda não rompido
   * (topo interno no long, fundo interno no short). Depois do gatilho, o nível que foi rompido.
   */
  triggerLevel: { price: number; source: string } | null;
  triggeredAt: number | null;
  triggerIndex: number | null;
  /** distância do fechamento até a borda da zona, em ATR (0 = dentro) */
  distanceToZoneAtr: number;
  checks: { setupDetected: boolean; structureAligned: boolean; confluenceMet: boolean; awaitingTrigger: boolean };
}

/** READY exige confluência Good (≥ 60); FORMING, Moderate (≥ 40) — mesmas faixas do rótulo do Confluence Score. */
export const SETUP_THRESHOLDS = { ready: 60, forming: 40, readyDistanceAtr: 1, expireBars: 40, triggerLookback: 30 } as const;

const s = (d: "bullish" | "bearish") => (d === "bullish" ? 1 : -1);

export function buildSetupGeometry(
  candles: readonly Candle[],
  direction: "bullish" | "bearish",
  external: StructureResult,
  internal: StructureResult,
  liquidity: LiquidityMap,
): SetupGeometry | null {
  const close = candles[candles.length - 1]?.close;
  const atrV = external.atr;
  if (close == null || !Number.isFinite(atrV) || atrV <= 0) return null;
  const long = direction === "bullish";
  const sign = s(direction);

  type Lv = { price: number; source: string };
  const cands: Lv[] = [];
  const push = (price: number | undefined | null, source: string) => {
    if (price != null && Number.isFinite(price) && (long ? price < close : price > close)) cands.push({ price, source });
  };
  if (long) {
    push(external.lastLow?.price, "fundo externo");
    push(internal.lastLow?.price, "fundo interno");
    push(liquidity.nearestBelow?.price, `liquidez ${liquidity.nearestBelow?.kind ?? ""}`.trim());
  } else {
    push(external.lastHigh?.price, "topo externo");
    push(internal.lastHigh?.price, "topo interno");
    push(liquidity.nearestAbove?.price, `liquidez ${liquidity.nearestAbove?.kind ?? ""}`.trim());
  }
  if (external.range) push(external.range.equilibrium, "equilíbrio da faixa");
  if (!cands.length) return null;
  // nível mais próximo do preço (suporte mais alto no long; resistência mais baixa no short)
  cands.sort((a, b) => (long ? b.price - a.price : a.price - b.price));
  const key = cands[0] as Lv;
  const zone = long ? { low: key.price, high: key.price + 0.5 * atrV } : { low: key.price - 0.5 * atrV, high: key.price };

  // invalidação: swing externo além da zona; senão o mais distante dos candidatos; senão zona ∓ 1 ATR
  const extInv = long ? external.lastLow?.price : external.lastHigh?.price;
  let invalidation: Lv;
  if (extInv != null && (long ? extInv < zone.low : extInv > zone.high)) invalidation = { price: extInv, source: long ? "fundo externo" : "topo externo" };
  else {
    const beyond = cands.filter((c) => (long ? c.price < zone.low : c.price > zone.high));
    const far = beyond[beyond.length - 1];
    invalidation = far ? { price: far.price, source: far.source } : { price: long ? zone.low - atrV : zone.high + atrV, source: "zona ∓ 1 ATR (sem swing além da zona)" };
  }
  const stop = invalidation.price - sign * 0.1 * atrV;
  const ideal = (zone.low + zone.high) / 2;
  const maxEntry = long ? zone.high : zone.low;
  const risk = Math.abs(ideal - stop);

  const levels: Lv[] = [];
  for (const p of liquidity.pools) {
    if (p.state !== "available") continue;
    if (long ? p.price > ideal && p.side === "BSL" : p.price < ideal && p.side === "SSL") levels.push({ price: p.price, source: `liquidez ${p.kind}` });
  }
  const extTarget = long ? external.lastHigh?.price : external.lastLow?.price;
  if (extTarget != null && (long ? extTarget > ideal : extTarget < ideal)) levels.push({ price: extTarget, source: long ? "topo externo" : "fundo externo" });
  levels.sort((a, b) => (long ? a.price - b.price : b.price - a.price));
  const picked: Lv[] = [];
  for (const l of levels) {
    const prev = picked[picked.length - 1];
    // ignora alvo a menos de 0,5R da entrada e níveis a menos de 0,3 ATR entre si
    if (Math.abs(l.price - ideal) < 0.5 * risk) continue;
    if (prev && Math.abs(l.price - prev.price) < 0.3 * atrV) continue;
    picked.push(l);
    if (picked.length === 3) break;
  }
  for (let k = 1; picked.length < 3 && k <= 6; k++) {
    const price = ideal + sign * (k + 1) * risk; // 2R, 3R, …
    const prev = picked[picked.length - 1];
    if (prev && (long ? price <= prev.price : price >= prev.price)) continue;
    picked.push({ price, source: `${k + 1}R (sem nível de liquidez)` });
  }
  const labels = ["TP1", "TP2", "TP3"] as const;
  const targets: SetupTarget[] = picked.slice(0, 3).map((l, i) => ({ label: labels[i] as SetupTarget["label"], price: l.price, r: risk > 0 ? Math.abs(l.price - ideal) / risk : NaN, source: l.source }));
  return {
    direction,
    keyLevel: key,
    entryZone: zone,
    idealEntry: ideal,
    maxEntry,
    invalidation,
    stop,
    targets,
    rr: targets[0] && risk > 0 ? targets[0].r : null,
    atr: atrV,
  };
}

/**
 * Estado por regras sobre os candles fechados. `confluenceScore` vem do Confluence Engine.
 */
export function evaluateSetup(candles: readonly Candle[], g: SetupGeometry, internal: StructureResult, structureAligned: boolean, confluenceScore: number): SetupEvaluation {
  const long = g.direction === "bullish";
  const n = candles.length;
  const last = candles[n - 1] as Candle;
  const inZone = (c: Candle) => (long ? c.low <= g.entryZone.high && c.high >= g.stop : c.high >= g.entryZone.low && c.low <= g.stop);
  const dist = long ? Math.max(0, (last.close - g.entryZone.high) / g.atr) : Math.max(0, (g.entryZone.low - last.close) / g.atr);

  // toque na zona mais recente dentro da janela e gatilho posterior pela estrutura interna
  let touch = -1;
  for (let i = n - 1; i >= Math.max(0, n - SETUP_THRESHOLDS.triggerLookback); i--) {
    if (inZone(candles[i] as Candle)) {
      touch = i;
      break;
    }
  }
  let trigger: number | null = null;
  if (touch >= 0) {
    // procura o primeiro evento interno na direção a partir do toque mais antigo contíguo
    let start = touch;
    while (start > 0 && inZone(candles[start - 1] as Candle) && touch - start < SETUP_THRESHOLDS.triggerLookback) start--;
    const ev = internal.events.find((e) => e.index >= start && e.direction === g.direction);
    if (ev) trigger = ev.index;
  }

  let triggerLevel: SetupEvaluation["triggerLevel"] = null;
  if (trigger != null) {
    const ev = internal.events.find((e) => e.index === trigger && e.direction === g.direction);
    if (ev) triggerLevel = { price: ev.level, source: `${ev.type} interno rompido` };
  } else if (touch >= 0) {
    // após tocar a zona: swing interno a favor mais recente ainda não rompido pelo fechamento, entre a
    // zona e o TP1 (um gatilho além do TP1 não deixaria R:R; nesse caso fica sem nível)
    const tp1 = g.targets[0]?.price;
    const cand = [...internal.swings]
      .reverse()
      .find((sw) => sw.kind === (long ? "high" : "low") && (long ? sw.price > last.close : sw.price < last.close) && (tp1 == null || (long ? sw.price < tp1 : sw.price > tp1)));
    if (cand) triggerLevel = { price: cand.price, source: long ? "topo interno (fechamento acima confirma)" : "fundo interno (fechamento abaixo confirma)" };
  }

  const base = {
    ...g,
    triggerLevel,
    distanceToZoneAtr: dist,
    triggerIndex: trigger,
    triggeredAt: trigger != null ? (candles[trigger] as Candle).openTime : null,
  };
  const checks = { setupDetected: true, structureAligned, confluenceMet: confluenceScore >= SETUP_THRESHOLDS.ready, awaitingTrigger: false };

  if (trigger != null) {
    const tp1 = g.targets[0]?.price;
    for (let j = trigger + 1; j < n; j++) {
      const c = candles[j] as Candle;
      if (long ? c.low <= g.stop : c.high >= g.stop) return { ...base, state: "INVALIDATED", stateReason: `stop ${g.stop.toPrecision(6)} atingido após o gatilho`, checks };
      if (tp1 != null && (long ? c.high >= tp1 : c.low <= tp1)) return { ...base, state: "TARGET_HIT", stateReason: `TP1 ${tp1.toPrecision(6)} atingido`, checks };
    }
    const bars = n - 1 - trigger;
    if (bars > SETUP_THRESHOLDS.expireBars) return { ...base, state: "EXPIRED", stateReason: `${bars} candles sem alvo nem stop após o gatilho`, checks };
    if (bars === 0) return { ...base, state: "TRIGGERED", stateReason: "gatilho no último candle fechado (quebra da estrutura interna após tocar a zona)", checks };
    return { ...base, state: "ACTIVE", stateReason: `gatilho há ${bars} candle(s); entre stop e TP1`, checks };
  }
  if (long ? last.close < g.invalidation.price : last.close > g.invalidation.price) return { ...base, state: "INVALIDATED", stateReason: "fechamento além da invalidação estrutural", checks };
  if (confluenceScore >= SETUP_THRESHOLDS.ready && dist <= SETUP_THRESHOLDS.readyDistanceAtr)
    return { ...base, state: "READY", stateReason: dist === 0 ? "preço na zona; aguardando quebra da estrutura interna" : `a ${dist.toFixed(2)} ATR da zona; aguardando chegada e gatilho`, checks: { ...checks, awaitingTrigger: true } };
  if (confluenceScore >= SETUP_THRESHOLDS.forming) return { ...base, state: "FORMING", stateReason: `confluência ${Math.round(confluenceScore)}; preço a ${dist.toFixed(2)} ATR da zona`, checks };
  return { ...base, state: "DETECTED", stateReason: `geometria válida, confluência ${Math.round(confluenceScore)} abaixo de ${SETUP_THRESHOLDS.forming}`, checks };
}
