/**
 * Valida um modelo do Strategy Builder com o MESMO código do produto (strategySignals + runSignals),
 * em todos os ativos do histórico, separando IS (60% iniciais do tempo) e OOS (40% finais).
 * Os números publicados no modelo saem daqui.
 *   npx tsx tools/research/validate-template.ts <history.json> "<nome do modelo>" [feeBps=10] [slipBps=5]
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle, Timeframe } from "@/types/market";
import { STRATEGY_TEMPLATES, executionTf } from "@/lib/strategies/definition";
import { DEFAULT_COSTS, runSignals, strategySignals, type BtTrade } from "@/lib/backtest/engine";
import { fmt, mean } from "./breakout-lib";

type Hist = Record<string, Record<string, Candle[]>>;
type T = BtTrade & { symbol: string };

function main() {
  const [, , file, name, feeArg = "10", slipArg = "5", curveOut] = process.argv;
  const tpl = STRATEGY_TEMPLATES.find((t) => t.name === name);
  if (!tpl) throw new Error(`modelo não encontrado: ${name}`);
  const def = tpl.definition;
  const tf = executionTf(def) as Timeframe;
  const hist = JSON.parse(readFileSync(file as string, "utf8")) as Hist;
  const costs = { ...DEFAULT_COSTS, feeBps: Number(feeArg), slippageBps: Number(slipArg), riskPct: 0.5 };
  const all: T[] = [];
  let start = Infinity;
  let end = -Infinity;
  const t0 = Date.now();
  for (const [symbol, h] of Object.entries(hist)) {
    const cs = h[tf];
    if (!cs || cs.length < 300) continue;
    start = Math.min(start, (cs[0] as Candle).openTime);
    end = Math.max(end, (cs[cs.length - 1] as Candle).openTime);
    const sig = strategySignals(def, cs, {}, 210);
    const res = runSignals(cs, sig, tf, costs, 210);
    all.push(...res.trades.map((t) => ({ ...t, symbol })));
  }
  const cut = start + 0.6 * (end - start);
  all.sort((a, b) => a.entryTime - b.entryTime);
  const d = (t: number) => new Date(t).toISOString().slice(0, 10);
  const is = all.filter((t) => t.entryTime < cut);
  const oos = all.filter((t) => t.entryTime >= cut);
  console.log(`${name} · ${tf} · ${d(start)} → ${d(end)} · corte ${d(cut)} · taxa ${feeArg} + slippage ${slipArg} bps/lado · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("IS ", fmt(is.map((t) => t.rNet)), `| bruto E=${mean(is.map((t) => t.rGross)).toFixed(3)}`);
  console.log("OOS", fmt(oos.map((t) => t.rNet)), `| bruto E=${mean(oos.map((t) => t.rGross)).toFixed(3)}`);
  const bySym = new Map<string, number>();
  for (const t of oos) bySym.set(t.symbol, (bySym.get(t.symbol) ?? 0) + t.rNet);
  const sorted = [...bySym.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const top3 = sorted.slice(0, 3).reduce((s, [, v]) => s + v, 0);
  console.log(`OOS amplitude: ${sorted.filter(([, v]) => v > 0).length}/${sorted.length} ativos positivos · top3 ${sorted.slice(0, 3).map(([s, v]) => `${s} ${v.toFixed(1)}`).join(", ")} · somaR sem top3 = ${(total - top3).toFixed(1)}`);
  if (curveOut) {
    // curva fora da amostra em R acumulado (ordem de saída), para exibir no site
    const seq = [...oos].sort((a, b) => a.exitTime - b.exitTime);
    let acc = 0;
    const points = seq.map((t) => [t.exitTime, Math.round((acc += t.rNet) * 100) / 100] as const);
    writeFileSync(curveOut, JSON.stringify({ model: name, from: seq[0]?.exitTime ?? null, to: seq[seq.length - 1]?.exitTime ?? null, trades: seq.length, points }));
  }
  const bars = oos.map((t) => t.bars).sort((a, b) => a - b);
  console.log(`OOS duração mediana ${bars[Math.floor(bars.length / 2)]} candles · p90 ${bars[Math.floor(bars.length * 0.9)]} · custo médio ${mean(oos.map((t) => t.costR)).toFixed(3)}R`);
  // carteira: risco fixo por trade, sem limite e com limite de 5 posições; drawdown medido nas saídas
  for (const [label, set] of [["IS ", is], ["OOS", oos]] as const) {
    const out: string[] = [];
    for (const risk of [0.25, 0.5, 1]) {
      for (const k of [5, 99]) {
        const open: T[] = [];
        let eq = 1;
        let peak = 1;
        let dd = 0;
        const close = (until: number) => {
          open.sort((a, b) => a.exitTime - b.exitTime);
          while (open.length && (open[0] as T).exitTime <= until) {
            const t = open.shift() as T;
            eq *= 1 + (risk / 100) * t.rNet;
            peak = Math.max(peak, eq);
            dd = Math.max(dd, 1 - eq / peak);
          }
        };
        for (const t of set) {
          close(t.entryTime);
          if (open.length < k) open.push(t);
        }
        close(Infinity);
        out.push(`${risk}%${k === 99 ? "" : ` K${k}`}: ${((eq - 1) * 100).toFixed(0)}%/dd ${(dd * 100).toFixed(0)}%`);
      }
    }
    console.log(`${label} carteira ${out.join(" · ")}`);
  }
}
main();
