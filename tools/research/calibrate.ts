/**
 * Calibração do setup com validação fora da amostra.
 *   npx tsx tools/research/calibrate.ts <candidatos.json> [custoBpsPorLado=15] [fracaoIS=0.6]
 *
 * Método:
 *  1. Separação no tempo: IS = candidatos antes da data de corte (60% dos candidatos); OOS = depois.
 *  2. Espaço de busca pequeno e definido antes (filtros com justificativa de mercado × saídas).
 *  3. Seleção SÓ no IS: n ≥ 150 e maior limite inferior do IC 90% (bootstrap) da expectativa líquida.
 *  4. O escolhido é medido no OOS (nunca visto). Também reportamos o OOS dos 20 melhores do IS
 *     (se a vantagem some fora da amostra, era ajuste ao ruído).
 *  Custos: taxa + slippage por lado sobre o notional; uma posição por ativo por vez.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Candidate } from "./gen-candidates";

type C = Candidate;
interface Exit {
  key: string;
  stop: "struct" | number;
  target: "tp1" | number;
  horizon: number;
}
interface Filter {
  key: string;
  f: (c: C) => boolean;
}

const sgn = (c: C) => (c.direction === "bullish" ? 1 : -1);
const opp = (d: string) => (d === "bullish" ? "bearish" : "bullish");

const FILTERS: Filter[] = [
  { key: "d1_alinhado", f: (c) => c.htf1dTrend === c.direction },
  { key: "d1_nao_contra", f: (c) => c.htf1dTrend !== opp(c.direction) },
  { key: "w1_alinhado", f: (c) => c.htf1wTrend === c.direction },
  { key: "regime_tendencia", f: (c) => (c.direction === "bullish" ? c.regime === "Bull Trend" : c.regime === "Bear Trend") || c.regime === "Expansion" },
  { key: "sem_range_hv", f: (c) => c.regime !== "Range" && c.regime !== "High Volatility" },
  { key: "conf_50", f: (c) => c.confNorm >= 50 },
  { key: "conf_60", f: (c) => c.confNorm >= 60 },
  { key: "evento_bos", f: (c) => c.eventType === "BOS" },
  { key: "risco_2atr", f: (c) => c.riskAtr <= 2 },
  { key: "risco_3atr", f: (c) => c.riskAtr <= 3 },
  { key: "varredura", f: (c) => c.sweepWith },
  { key: "rvol_1", f: (c) => (c.rvol ?? 0) >= 1 },
  { key: "ema_a_favor", f: (c) => sgn(c) * c.emaScore > 30 },
  { key: "longs", f: (c) => c.direction === "bullish" },
];

const EXITS: Exit[] = [];
for (const stop of ["struct", 1, 1.5, 2] as const) for (const target of ["tp1", 1, 1.5, 2, 3] as const) EXITS.push({ key: `stop_${stop}|alvo_${target}`, stop, target, horizon: 40 });

function simulate(c: C, e: Exit, costSide: number): number | null {
  const long = c.direction === "bullish";
  const s = sgn(c);
  const stop = e.stop === "struct" ? c.stop : c.entry - s * e.stop * c.atr;
  const risk = Math.abs(c.entry - stop);
  if (!(risk > 0)) return null;
  let target: number;
  if (e.target === "tp1") {
    if (c.tp1 == null) return null;
    target = c.tp1;
  } else target = c.entry + s * e.target * risk;
  if (long ? !(target > c.entry) : !(target < c.entry)) return null;
  let exit = c.path[Math.min(e.horizon, c.path.length) - 1]?.[2];
  if (exit == null) return null;
  for (let j = 0; j < Math.min(e.horizon, c.path.length); j++) {
    const [h, l] = c.path[j] as [number, number, number];
    const hitStop = long ? l <= stop : h >= stop;
    const hitTarget = long ? h >= target : l <= target;
    if (hitStop) {
      exit = stop; // stop e alvo no mesmo candle = stop (conservador)
      break;
    }
    if (hitTarget) {
      exit = target;
      break;
    }
  }
  const gross = s * (exit - c.entry);
  const cost = costSide * (c.entry + exit);
  return (gross - cost) / risk;
}

/** Uma posição por ativo por vez: descarta candidatos que abririam durante posição aberta (duração pelo caminho). */
function runSet(cands: C[], e: Exit, costSide: number): number[] {
  const bySym = new Map<string, C[]>();
  for (const c of cands) bySym.set(c.symbol, [...(bySym.get(c.symbol) ?? []), c]);
  const rs: number[] = [];
  for (const list of bySym.values()) {
    list.sort((a, b) => a.t - b.t);
    let busy = -1;
    for (const c of list) {
      if (c.t <= busy) continue;
      const r = simulate(c, e, costSide);
      if (r == null) continue;
      rs.push(r);
      // duração aproximada: até o horizonte (conservador para sobreposição)
      busy = c.t + holdBars(c, e);
    }
  }
  return rs;
}

function holdBars(c: C, e: Exit): number {
  const long = c.direction === "bullish";
  const s = sgn(c);
  const stop = e.stop === "struct" ? c.stop : c.entry - s * e.stop * c.atr;
  const risk = Math.abs(c.entry - stop);
  const target = e.target === "tp1" ? (c.tp1 ?? c.entry) : c.entry + s * e.target * risk;
  for (let j = 0; j < Math.min(e.horizon, c.path.length); j++) {
    const [h, l] = c.path[j] as [number, number, number];
    if ((long ? l <= stop : h >= stop) || (long ? h >= target : l <= target)) return j + 1;
  }
  return e.horizon;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** limite inferior do IC 90% da média (bootstrap com semente fixa) */
function bootLow(xs: number[], iters = 400): number {
  if (xs.length < 10) return NaN;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const ms: number[] = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += xs[Math.floor(rnd() * xs.length)] as number;
    ms.push(s / xs.length);
  }
  ms.sort((a, b) => a - b);
  return ms[Math.floor(iters * 0.05)] as number;
}

function stats(rs: number[]) {
  const pos = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const neg = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  let eq = 0;
  let peak = 0;
  let dd = 0;
  for (const r of rs) {
    eq += r;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  return { n: rs.length, e: mean(rs), low90: bootLow(rs), pf: neg > 0 ? pos / neg : Infinity, win: rs.length ? rs.filter((r) => r > 0).length / rs.length : NaN, maxDdR: dd };
}

function main() {
  const [, , file, costArg = "15", isArg = "0.6"] = process.argv;
  const all = JSON.parse(readFileSync(file as string, "utf8")) as C[];
  const costSide = Number(costArg) / 10_000;
  const times = all.map((c) => c.time).sort((a, b) => a - b);
  const cut = times[Math.floor(times.length * Number(isArg))] as number;
  const IS = all.filter((c) => c.time < cut);
  const OOS = all.filter((c) => c.time >= cut);
  console.log(`candidatos ${all.length} · IS ${IS.length} (até ${new Date(cut).toISOString().slice(0, 10)}) · OOS ${OOS.length} · custo ${costArg} bps/lado`);

  // conjuntos de filtros: nenhum, 1 filtro, pares
  const sets: Filter[][] = [[]];
  for (const f of FILTERS) sets.push([f]);
  for (let i = 0; i < FILTERS.length; i++) for (let j = i + 1; j < FILTERS.length; j++) sets.push([FILTERS[i] as Filter, FILTERS[j] as Filter]);

  const rows: Array<{ filters: string; exit: string; is: ReturnType<typeof stats>; oos: ReturnType<typeof stats> }> = [];
  for (const fs of sets) {
    const isC = IS.filter((c) => fs.every((f) => f.f(c)));
    const oosC = OOS.filter((c) => fs.every((f) => f.f(c)));
    for (const e of EXITS) rows.push({ filters: fs.map((f) => f.key).join("+") || "(nenhum)", exit: e.key, is: stats(runSet(isC, e, costSide)), oos: stats(runSet(oosC, e, costSide)) });
  }
  const base = rows.filter((r) => r.filters === "(nenhum)");
  const fmt = (s: ReturnType<typeof stats>) => `n=${String(s.n).padStart(4)} E=${s.e.toFixed(3).padStart(6)} low90=${Number.isFinite(s.low90) ? s.low90.toFixed(3).padStart(6) : "   n/a"} PF=${s.pf.toFixed(2)} win=${(s.win * 100).toFixed(0)}% ddR=${s.maxDdR.toFixed(1)}`;
  console.log("\n== linha de base (setup atual, sem filtro) ==");
  for (const r of base) console.log(r.exit.padEnd(26), "IS", fmt(r.is), "| OOS", fmt(r.oos));

  const eligible = rows.filter((r) => r.is.n >= 150 && Number.isFinite(r.is.low90)).sort((a, b) => b.is.low90 - a.is.low90);
  console.log(`\n== top 20 no IS (n ≥ 150; ordenado pelo limite inferior do IC 90%) de ${rows.length} configurações ==`);
  for (const r of eligible.slice(0, 20)) console.log(`${r.filters} | ${r.exit}`.padEnd(60), "IS", fmt(r.is), "| OOS", fmt(r.oos));
  const top20 = eligible.slice(0, 20);
  const oosPos = top20.filter((r) => r.oos.e > 0).length;
  console.log(`\nOOS dos 20 melhores do IS: ${oosPos}/20 com expectativa > 0 · mediana OOS E=${[...top20.map((r) => r.oos.e)].sort((a, b) => a - b)[10]?.toFixed(3)}`);
  const chosen = eligible[0];
  if (chosen) console.log(`\nESCOLHIDO (só pelo IS): ${chosen.filters} | ${chosen.exit}\n  IS  ${fmt(chosen.is)}\n  OOS ${fmt(chosen.oos)}`);
  writeFileSync((file as string).replace(/\.json$/, `-calib-${costArg}bps.json`), JSON.stringify({ cut, costBpsSide: Number(costArg), rows }, null, 0));
}
main();
