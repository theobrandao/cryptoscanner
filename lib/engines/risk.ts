/**
 * Risk Engine — cálculos determinísticos de posição, alavancagem e cenário.
 *
 * Contratos lineares USDⓈ-M (P&L em USDT = quantidade × variação de preço).
 * Preço de liquidação (fórmula da Binance para uma posição, faixa de manutenção com valor acumulado `cum`):
 *
 *   LP = (WB + cum − s·Q·EP) / (Q·MMR − s·Q)        s = +1 long, −1 short
 *
 * Isolated: WB = margem da posição (Q·EP/L). Cross: WB = saldo total da carteira de margem.
 * Com cum = 0 e isolated: long LP = EP·(1 − 1/L)/(1 − MMR); short LP = EP·(1 + 1/L)/(1 + MMR).
 * Fórmula exata da corretora depende da faixa (bracket) de manutenção — informe MMR e cum da sua faixa.
 */

export type Side = "long" | "short";
export type MarginMode = "isolated" | "cross";

const sgn = (side: Side) => (side === "long" ? 1 : -1);
const pos = (n: number) => Number.isFinite(n) && n > 0;

export function sideFrom(entry: number, stop: number): Side {
  return stop < entry ? "long" : "short";
}

export interface SizingInput {
  account: number;
  /** risco por operação em % da conta (ex.: 0.5 = 0,5%) */
  riskPct: number;
  entry: number;
  stop: number;
  target?: number;
  leverage?: number;
  /** taxa por lado em % do notional (ex.: 0.05) — incluída no risco */
  feePct?: number;
}

export interface SizingResult {
  side: Side;
  qty: number;
  notional: number;
  margin: number;
  leverage: number;
  capitalAtRisk: number;
  riskPctOfAccount: number;
  stopDistancePct: number;
  feesRoundTrip: number;
  rewardRisk: number | null;
  /** notional acima de 100% da conta × alavancagem disponível */
  exceedsBuyingPower: boolean;
  warnings: string[];
}

/** Tamanho de posição pelo risco: qty = (conta × risco%) / (|entrada − stop| + taxas por unidade). */
export function positionSize(i: SizingInput): SizingResult {
  if (!pos(i.account) || !pos(i.riskPct) || !pos(i.entry) || !pos(i.stop) || i.entry === i.stop) throw new Error("Entradas inválidas: conta, risco, entrada e stop devem ser positivos e entrada ≠ stop");
  const side = sideFrom(i.entry, i.stop);
  const lev = i.leverage != null && pos(i.leverage) ? i.leverage : 1;
  const fee = Math.max(0, i.feePct ?? 0) / 100;
  const riskAmount = i.account * (i.riskPct / 100);
  const perUnit = Math.abs(i.entry - i.stop) + fee * (i.entry + i.stop);
  const qty = riskAmount / perUnit;
  const notional = qty * i.entry;
  const margin = notional / lev;
  const warnings: string[] = [];
  let rewardRisk: number | null = null;
  if (i.target != null && pos(i.target)) {
    const valid = side === "long" ? i.target > i.entry : i.target < i.entry;
    if (!valid) warnings.push("Alvo do lado errado da entrada");
    else rewardRisk = Math.abs(i.target - i.entry) / Math.abs(i.entry - i.stop);
  }
  const exceeds = margin > i.account;
  if (exceeds) warnings.push("Margem necessária maior que a conta: reduza o risco, afaste o stop ou aumente a alavancagem (com mais risco de liquidação)");
  if (i.riskPct > 2) warnings.push("Risco por operação acima de 2% da conta");
  return {
    side,
    qty,
    notional,
    margin,
    leverage: lev,
    capitalAtRisk: riskAmount,
    riskPctOfAccount: i.riskPct,
    stopDistancePct: (Math.abs(i.entry - i.stop) / i.entry) * 100,
    feesRoundTrip: fee * qty * (i.entry + i.stop),
    rewardRisk,
    exceedsBuyingPower: exceeds,
    warnings,
  };
}

export function rMultiple(entry: number, stop: number, exit: number): number {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return NaN;
  return (sgn(sideFrom(entry, stop)) * (exit - entry)) / risk;
}

export interface LiquidationInput {
  side: Side;
  entry: number;
  qty: number;
  leverage: number;
  /** taxa de margem de manutenção (ex.: 0.004 = 0,4%) */
  mmr?: number;
  /** valor de manutenção acumulado da faixa (cum) */
  cum?: number;
  marginMode?: MarginMode;
  /** cross: saldo total disponível como margem */
  walletBalance?: number;
}

export function liquidationPrice(i: LiquidationInput): number {
  const s = sgn(i.side);
  const mmr = i.mmr ?? 0.005;
  const cum = i.cum ?? 0;
  if (!pos(i.entry) || !pos(i.qty) || !pos(i.leverage)) return NaN;
  const wb = i.marginMode === "cross" && pos(i.walletBalance ?? NaN) ? (i.walletBalance as number) : (i.qty * i.entry) / i.leverage;
  const lp = (wb + cum - s * i.qty * i.entry) / (i.qty * mmr - s * i.qty);
  return lp > 0 ? lp : 0; // long com margem ≥ notional: sem liquidação por preço positivo
}

export interface LiquidationView {
  price: number;
  distancePct: number;
  distanceAtr: number | null;
  /** stop está antes da liquidação (a posição é encerrada pelo stop, não pela corretora) */
  stopBeforeLiquidation: boolean | null;
}

export function liquidationView(i: LiquidationInput & { mark?: number; atr?: number; stop?: number }): LiquidationView {
  const price = liquidationPrice(i);
  const ref = pos(i.mark ?? NaN) ? (i.mark as number) : i.entry;
  const distancePct = price > 0 ? (Math.abs(ref - price) / ref) * 100 : 100;
  return {
    price,
    distancePct,
    distanceAtr: pos(i.atr ?? NaN) && price > 0 ? Math.abs(ref - price) / (i.atr as number) : null,
    stopBeforeLiquidation: i.stop != null && pos(i.stop) ? (i.side === "long" ? i.stop > price : i.stop < price) : null,
  };
}

export interface AverageInput {
  side: Side;
  /** posição atual */
  qty: number;
  entry: number;
  leverage: number;
  /** nova ordem */
  addQty: number;
  addPrice: number;
  /** alavancagem da ordem nova (padrão: a mesma) */
  addLeverage?: number;
  stop?: number;
  mmr?: number;
  marginMode?: MarginMode;
  walletBalance?: number;
}

export interface AverageResult {
  newQty: number;
  newEntry: number;
  newNotional: number;
  newMargin: number;
  effectiveLeverage: number;
  liquidationBefore: number;
  liquidationAfter: number;
  /** perda até o stop antes e depois (null sem stop) */
  riskBefore: number | null;
  riskAfter: number | null;
  riskIncreasePct: number | null;
  warnings: string[];
}

/** Preço médio ponderado por quantidade e efeito no risco e na liquidação. */
export function averagePrice(i: AverageInput): AverageResult {
  if (!pos(i.qty) || !pos(i.entry) || !pos(i.addQty) || !pos(i.addPrice) || !pos(i.leverage)) throw new Error("Entradas inválidas");
  const newQty = i.qty + i.addQty;
  const newEntry = (i.qty * i.entry + i.addQty * i.addPrice) / newQty;
  const m1 = (i.qty * i.entry) / i.leverage;
  const m2 = (i.addQty * i.addPrice) / (i.addLeverage ?? i.leverage);
  const newMargin = m1 + m2;
  const newNotional = newQty * newEntry;
  const effectiveLeverage = newNotional / newMargin;
  const base = { side: i.side, mmr: i.mmr, marginMode: i.marginMode, walletBalance: i.walletBalance };
  const liquidationBefore = liquidationPrice({ ...base, entry: i.entry, qty: i.qty, leverage: i.leverage });
  const liquidationAfter = liquidationPrice({ ...base, entry: newEntry, qty: newQty, leverage: effectiveLeverage });
  const lossAt = (q: number, e: number) => (i.stop != null && pos(i.stop) ? Math.max(0, sgn(i.side) * (e - i.stop) * q) : null);
  const riskBefore = lossAt(i.qty, i.entry);
  const riskAfter = lossAt(newQty, newEntry);
  const warnings: string[] = [];
  const adverse = i.side === "long" ? i.addPrice < i.entry : i.addPrice > i.entry;
  if (adverse) warnings.push("Aumento contra a posição (preço médio): o prejuízo potencial até o stop cresce");
  if (riskBefore != null && riskAfter != null && riskBefore > 0 && riskAfter > riskBefore * 1.5) warnings.push(`Risco até o stop sobe ${(((riskAfter - riskBefore) / riskBefore) * 100).toFixed(0)}%`);
  if (i.stop != null && ((i.side === "long" && liquidationAfter >= i.stop) || (i.side === "short" && liquidationAfter <= i.stop && liquidationAfter > 0)))
    warnings.push("Liquidação estimada ficou antes do stop");
  return {
    newQty,
    newEntry,
    newNotional,
    newMargin,
    effectiveLeverage,
    liquidationBefore,
    liquidationAfter,
    riskBefore,
    riskAfter,
    riskIncreasePct: riskBefore != null && riskAfter != null && riskBefore > 0 ? ((riskAfter - riskBefore) / riskBefore) * 100 : null,
    warnings,
  };
}

export interface StressRow {
  movePct: number;
  price: number;
  pnl: number;
  pnlPctOfMargin: number;
  /** margem de manutenção / (margem + P&L); ≥ 100% = liquidação */
  marginRatioPct: number;
  distanceToLiqPct: number;
  liquidated: boolean;
  /** impacto sobre o patrimônio informado (null sem patrimônio) */
  equityImpactPct: number | null;
}

export const DEFAULT_STRESS_MOVES = [-15, -10, -5, -3, 3, 5, 10] as const;

export function stressTest(
  p: { side: Side; qty: number; entry: number; leverage: number; mark?: number; mmr?: number; marginMode?: MarginMode; walletBalance?: number; equity?: number },
  moves: readonly number[] = DEFAULT_STRESS_MOVES,
): StressRow[] {
  const mmr = p.mmr ?? 0.005;
  const mark = pos(p.mark ?? NaN) ? (p.mark as number) : p.entry;
  const margin = p.marginMode === "cross" && pos(p.walletBalance ?? NaN) ? (p.walletBalance as number) : (p.qty * p.entry) / p.leverage;
  const liq = liquidationPrice({ side: p.side, entry: p.entry, qty: p.qty, leverage: p.leverage, mmr, marginMode: p.marginMode, walletBalance: p.walletBalance });
  return moves.map((m) => {
    const price = mark * (1 + m / 100);
    const pnl = sgn(p.side) * (price - p.entry) * p.qty;
    const maint = p.qty * price * mmr;
    const equity = margin + pnl;
    const ratio = equity > 0 ? (maint / equity) * 100 : Infinity;
    const liquidated = p.side === "long" ? price <= liq : liq > 0 && price >= liq;
    return {
      movePct: m,
      price,
      pnl,
      pnlPctOfMargin: (pnl / margin) * 100,
      marginRatioPct: ratio,
      distanceToLiqPct: liq > 0 ? (sgn(p.side) * (price - liq) * 100) / price : 100,
      liquidated,
      equityImpactPct: pos(p.equity ?? NaN) ? (pnl / (p.equity as number)) * 100 : null,
    };
  });
}

export interface StopOption {
  kind: "structural" | "volatility" | "tight";
  price: number;
  distancePct: number;
  distanceAtr: number;
  rationale: string;
  tradeoff: string;
}

/**
 * Três stops sem valor arbitrário:
 *  - estrutural: além do swing de invalidação + 0,1 ATR de folga;
 *  - volatilidade: swing ± 1 ATR (resiste a ruído, exige posição menor);
 *  - curto: além da microestrutura (swing interno) + 0,1 ATR (maior chance de ser atingido).
 */
export function smartStops(i: { side: Side; entry: number; atr: number; invalidation: number; micro?: number | null }): StopOption[] {
  if (!pos(i.entry) || !pos(i.atr) || !pos(i.invalidation)) return [];
  const s = sgn(i.side);
  const mk = (kind: StopOption["kind"], price: number, rationale: string, tradeoff: string): StopOption => ({
    kind,
    price,
    distancePct: (Math.abs(i.entry - price) / i.entry) * 100,
    distanceAtr: Math.abs(i.entry - price) / i.atr,
    rationale,
    tradeoff,
  });
  const out: StopOption[] = [
    mk("structural", i.invalidation - s * 0.1 * i.atr, "Além do swing que invalida a estrutura (+0,1 ATR)", "Equilíbrio entre ruído e tamanho de posição"),
    mk("volatility", i.invalidation - s * 1 * i.atr, "Swing de invalidação ± 1 ATR", "Menos stops por ruído; posição menor para o mesmo risco"),
  ];
  if (i.micro != null && pos(i.micro)) {
    const valid = i.side === "long" ? i.micro < i.entry : i.micro > i.entry;
    if (valid) out.push(mk("tight", i.micro - s * 0.1 * i.atr, "Além da microestrutura (swing interno)", "Posição maior para o mesmo risco; mais chance de stop por ruído"));
  }
  // descarta stops do lado errado da entrada
  return out.filter((o) => (i.side === "long" ? o.price < i.entry : o.price > i.entry));
}

/** EV em R = P(win)·média ganho(R) − P(loss)·média perda(R). */
export function expectedValueR(pWin: number, avgWinR: number, avgLossR: number): number {
  return pWin * avgWinR - (1 - pWin) * Math.abs(avgLossR);
}
