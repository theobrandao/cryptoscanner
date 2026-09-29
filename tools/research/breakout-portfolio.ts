/**
 * Carteira: todos os ativos ao mesmo tempo, com limite de posições simultâneas e risco fixo por trade.
 * Mede o que o usuário sentiria: retorno composto e drawdown em % (nas saídas), por período IS/OOS.
 *   npx tsx tools/research/breakout-portfolio.ts <history.json> <tf> "<N,trail,stopAtr>" [custoBps=15]
 */
import { readFileSync } from "node:fs";
import { prepare, runStrategy, type Hist, type Trade } from "./breakout-lib";

function main() {
  const [, , file, tf = "4h", cfgArg = "55,20,2", costArg = "15"] = process.argv;
  const [entryN, trailN, stopAtr] = (cfgArg as string).split(",").map(Number) as [number, number, number];
  const hist = JSON.parse(readFileSync(file as string, "utf8")) as Hist;
  const cost = Number(costArg) / 10_000;
  const trades: Trade[] = [];
  let start = Infinity;
  let end = -Infinity;
  for (const [sym, h] of Object.entries(hist)) {
    const cs = h[tf];
    if (!cs || cs.length < 300) continue;
    start = Math.min(start, cs[0]!.openTime);
    end = Math.max(end, cs[cs.length - 1]!.openTime);
    trades.push(...runStrategy(sym, prepare(cs), { entryN, trailN, stopAtr, trend: true, side: "long" }, cost));
  }
  const cut = start + 0.6 * (end - start);
  trades.sort((a, b) => a.time - b.time || a.symbol.localeCompare(b.symbol));
  const d = (t: number) => new Date(t).toISOString().slice(0, 10);
  console.log(`${tf} N${entryN} trail${trailN} stop${stopAtr}ATR EMA200 long · ${trades.length} sinais · corte ${d(cut)} · custo ${costArg} bps/lado`);
  for (const [label, from, to] of [["IS ", start, cut], ["OOS", cut, end + 1]] as const) {
    for (const risk of [0.25, 0.5, 1]) {
      const row: string[] = [];
      for (const k of [3, 5, 10, 99]) {
        const open: Trade[] = [];
        let eq = 1;
        let peak = 1;
        let dd = 0;
        let taken = 0;
        let maxOpen = 0;
        const close = (until: number) => {
          open.sort((a, b) => a.exitTime - b.exitTime);
          while (open.length && (open[0] as Trade).exitTime <= until) {
            const t = open.shift() as Trade;
            eq *= 1 + (risk / 100) * t.r;
            peak = Math.max(peak, eq);
            dd = Math.max(dd, 1 - eq / peak);
          }
        };
        for (const t of trades) {
          if (t.time < from || t.time >= to) continue;
          close(t.time);
          if (open.length >= k) continue;
          open.push(t);
          taken++;
          maxOpen = Math.max(maxOpen, open.length);
        }
        close(Infinity);
        row.push(`K=${String(k === 99 ? "∞" : k).padEnd(2)} ret=${((eq - 1) * 100).toFixed(0).padStart(4)}% dd=${(dd * 100).toFixed(0).padStart(3)}% n=${taken}`);
      }
      console.log(`${label} risco ${risk.toFixed(2)}%/trade | ${row.join(" | ")}`);
    }
  }
}
main();
