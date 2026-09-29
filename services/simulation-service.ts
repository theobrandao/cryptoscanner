import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { ASSETS } from "@/lib/assets";
import { cached } from "@/lib/cache";
import { round } from "@/lib/indicators/core";
import { getDailyHistory } from "@/services/market/providers/binance";
import type { Candle } from "@/types/market";

/**
 * Simulador histórico (backtest) de aportes em cripto: DCA mensal ou aporte único, em USD ou BRL,
 * com perfil de risco que define a fração alocada no ativo (o restante fica em reserva sem rendimento).
 * Metodologia própria e declarada; não é projeção de retorno futuro.
 */
export const simulationInputSchema = z.object({
  symbol: symbolSchema,
  strategy: z.enum(["dca", "lump_sum"]),
  currency: z.enum(["USD", "BRL", "EUR"]).default("BRL"),
  initialCapital: z.number().min(0).max(1e9),
  monthlyContribution: z.number().min(0).max(1e8).default(0),
  months: z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(36)]),
  riskProfile: z.enum(["conservador", "moderado", "arrojado"]).default("moderado"),
});

export type SimulationInput = z.infer<typeof simulationInputSchema>;

/** Fração do capital alocada no ativo por perfil (o restante fica em reserva 0 %). */
export const RISK_ALLOCATION: Record<SimulationInput["riskProfile"], number> = { conservador: 0.4, moderado: 0.7, arrojado: 1 };

export interface SimulationPoint {
  time: number; // epoch ms (dia)
  invested: number;
  value: number; // ativo + reserva
  assetValue: number;
  reserve: number;
  units: number;
  price: number;
}

export interface SimulationResult {
  input: SimulationInput;
  allocation: number;
  startDate: number;
  endDate: number;
  daysCovered: number;
  contributions: number;
  totalInvested: number;
  finalValue: number;
  profit: number;
  profitPct: number;
  /** retorno anualizado composto */
  cagrPct: number | null;
  maxDrawdownPct: number;
  unitsHeld: number;
  averagePrice: number | null;
  firstPrice: number;
  lastPrice: number;
  /** comparativo: mesmo capital total sem o ativo (reserva) e 100 % no ativo desde o início */
  benchmarkHoldPct: number;
  bestMonth: { month: string; pct: number } | null;
  worstMonth: { month: string; pct: number } | null;
  curve: SimulationPoint[]; // pontos semanais (para o gráfico)
  monthly: Array<{ month: string; invested: number; value: number; pct: number }>;
  fx: { applied: boolean; source: string };
  source: string;
  disclaimer: string;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function history(pair: string, days: number): Promise<Candle[]> {
  const res = await cached<Candle[]>(`sim:hist:${pair}:${days}`, 3600, () => getDailyHistory(pair, days), { staleTtlSeconds: 48 * 3600 });
  return res.value;
}

export async function runSimulation(input: SimulationInput): Promise<SimulationResult> {
  const asset = ASSETS.find((a) => a.symbol === input.symbol);
  if (!asset) throw new Error(`Ativo desconhecido: ${input.symbol}`);
  const days = Math.round(input.months * 30.44) + 3;
  // BRL: USDTBRL (R$ por USDT) multiplica; EUR: EURUSDT (USDT por €) divide.
  const fxPair = input.currency === "BRL" ? "USDTBRL" : input.currency === "EUR" ? "EURUSDT" : null;
  const [assetCandles, fxCandles] = await Promise.all([history(asset.binancePair, days), fxPair ? history(fxPair, days) : Promise.resolve<Candle[]>([])]);
  if (assetCandles.length < 30) throw new Error("Histórico insuficiente para o período solicitado");
  const fxByDay = new Map(fxCandles.map((c) => [monthKey(c.openTime) + "-" + new Date(c.openTime).getUTCDate(), c.close]));
  const fxFor = (c: Candle): number => {
    if (!fxPair) return 1;
    const key = monthKey(c.openTime) + "-" + new Date(c.openTime).getUTCDate();
    const raw = fxByDay.get(key) ?? fxCandles[fxCandles.length - 1]?.close ?? 1;
    return input.currency === "EUR" ? 1 / raw : raw;
  };
  const priced = assetCandles.map((c) => ({ time: c.openTime, price: c.close * fxFor(c) }));
  const alloc = RISK_ALLOCATION[input.riskProfile];

  let units = 0;
  let reserve = 0;
  let invested = 0;
  let contributions = 0;
  let peak = 0;
  let maxDd = 0;
  let lastMonth = "";
  const curve: SimulationPoint[] = [];
  const monthly: SimulationResult["monthly"] = [];
  let monthStartValue = 0;
  let monthInvested = 0;

  priced.forEach((p, i) => {
    const mk = monthKey(p.time);
    const newMonth = mk !== lastMonth;
    if (i === 0 && input.initialCapital > 0) {
      units += (input.initialCapital * alloc) / p.price;
      reserve += input.initialCapital * (1 - alloc);
      invested += input.initialCapital;
      contributions++;
    }
    if (newMonth && i > 0 && input.strategy === "dca" && input.monthlyContribution > 0) {
      units += (input.monthlyContribution * alloc) / p.price;
      reserve += input.monthlyContribution * (1 - alloc);
      invested += input.monthlyContribution;
      contributions++;
      monthInvested += input.monthlyContribution;
    }
    const assetValue = units * p.price;
    const value = assetValue + reserve;
    peak = Math.max(peak, value);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - value) / peak) * 100);
    if (newMonth) {
      if (lastMonth) {
        const prev = curve[curve.length - 1];
        const base = monthStartValue + monthInvested;
        if (prev) monthly.push({ month: lastMonth, invested: round(monthInvested, 2), value: round(prev.value, 2), pct: base > 0 ? round(((prev.value - base) / base) * 100, 2) : 0 });
      }
      monthStartValue = value;
      monthInvested = 0;
      lastMonth = mk;
    }
    if (i % 7 === 0 || i === priced.length - 1) curve.push({ time: p.time, invested: round(invested, 2), value: round(value, 2), assetValue: round(assetValue, 2), reserve: round(reserve, 2), units: round(units, 8), price: round(p.price, 8) });
  });
  const last = priced[priced.length - 1]!;
  const first = priced[0]!;
  const finalValue = units * last.price + reserve;
  const profit = finalValue - invested;
  const years = (last.time - first.time) / (365.25 * 24 * 3600_000);
  const cagr = invested > 0 && years > 0.2 ? (Math.pow(finalValue / invested, 1 / years) - 1) * 100 : null;
  const sortedMonths = [...monthly].sort((a, b) => b.pct - a.pct);
  return {
    input,
    allocation: alloc,
    startDate: first.time,
    endDate: last.time,
    daysCovered: priced.length,
    contributions,
    totalInvested: round(invested, 2),
    finalValue: round(finalValue, 2),
    profit: round(profit, 2),
    profitPct: invested > 0 ? round((profit / invested) * 100, 2) : 0,
    cagrPct: cagr === null ? null : round(cagr, 2),
    maxDrawdownPct: round(maxDd, 2),
    unitsHeld: round(units, 8),
    averagePrice: units > 0 ? round((invested * alloc) / units, 8) : null,
    firstPrice: round(first.price, 8),
    lastPrice: round(last.price, 8),
    benchmarkHoldPct: round(((last.price - first.price) / first.price) * 100, 2),
    bestMonth: sortedMonths[0] ?? null,
    worstMonth: sortedMonths[sortedMonths.length - 1] ?? null,
    curve,
    monthly,
    fx: { applied: fxPair !== null, source: fxPair ? `${fxPair} diário (Binance)` : "—" },
    source: "binance",
    disclaimer: "Simulação histórica com preços diários reais (fechamento) — não é projeção nem recomendação. Não considera taxas, spread, impostos ou rendimento da reserva.",
  };
}
