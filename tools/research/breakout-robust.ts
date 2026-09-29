/**
 * Robustez da família de rompimento (Donchian). Mesmo protocolo do breakout.ts + testes de estresse:
 *   1. mercado no período (buy & hold mediano por ativo) — contexto de regime
 *   2. escolhido só pelo IS → OOS; entrada na abertura seguinte; custo 2×; amplitude por ativo; por ano
 *   3. teste nulo: entradas aleatórias no OOS (mesma quantidade por ativo, mesmo filtro e mesma saída)
 *      → se o aleatório empata com o rompimento, a vantagem vem do filtro/saída (beta), não do sinal
 *   4. split invertido (seleciona no período final, testa no inicial) e correlação de postos entre períodos
 *   npx tsx tools/research/breakout-robust.ts <history.json> <tf> [custoBps=15] [iteracoesNulo=300]
 */
import { readFileSync } from "node:fs";
import type { Candle } from "@/types/market";
import { cfgKey, fmt, grid, mean, prepare, rng, runStrategy, simulateFrom, stats, type Cfg, type Hist, type Prepared, type Trade } from "./breakout-lib";

function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, v, i) => s + (v - (rb[i] as number)) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

function main() {
  const [, , file, tf = "1d", costArg = "15", itArg = "300"] = process.argv;
  const hist = JSON.parse(readFileSync(file as string, "utf8")) as Hist;
  const cost = Number(costArg) / 10_000;
  const iters = Number(itArg);
  const assets: Array<{ sym: string; p: Prepared }> = [];
  for (const [sym, h] of Object.entries(hist)) {
    const cs = h[tf];
    if (cs && cs.length >= 300) assets.push({ sym, p: prepare(cs) });
  }
  const allTimes = assets.flatMap((a) => a.p.cs.map((c) => c.openTime)).sort((a, b) => a - b);
  const start = allTimes[0] as number;
  const end = allTimes[allTimes.length - 1] as number;
  const cut = start + 0.6 * (end - start);
  const d = (t: number) => new Date(t).toISOString().slice(0, 10);
  console.log(`${tf} · ${assets.length} ativos · ${d(start)} → ${d(end)} · corte ${d(cut)} · custo ${costArg} bps/lado`);

  // 1. contexto de mercado: buy & hold por ativo a partir do candle 210 (fim do aquecimento)
  const bh = (from: number, to: number) => {
    const rets: number[] = [];
    for (const { p } of assets) {
      const cs = p.cs.filter((c) => c.openTime >= from && c.openTime < to);
      if (cs.length < 20) continue;
      rets.push(((cs[cs.length - 1] as Candle).close / (cs[0] as Candle).close - 1) * 100);
    }
    rets.sort((a, b) => a - b);
    return `mediana ${(rets[Math.floor(rets.length / 2)] ?? NaN).toFixed(0)}% · positivos ${rets.filter((r) => r > 0).length}/${rets.length}`;
  };
  const warmEnd = Math.max(...assets.map((a) => (a.p.cs[210] as Candle | undefined)?.openTime ?? start));
  console.log(`buy&hold IS (após aquecimento ${d(warmEnd)}): ${bh(warmEnd, cut)} | OOS: ${bh(cut, end + 1)}`);

  // 2. grade completa
  const run = (cfg: Cfg, c = cost, nextOpen = false) => assets.flatMap(({ sym, p }) => runStrategy(sym, p, cfg, c, nextOpen));
  // ordem cronológica (carteira): drawdown em R medido na sequência real dos trades de todos os ativos
  const split = (ts: Trade[]) => {
    const sorted = [...ts].sort((a, b) => a.time - b.time);
    return { is: sorted.filter((t) => t.time < cut), oos: sorted.filter((t) => t.time >= cut) };
  };
  const rows = grid().map((cfg) => ({ cfg, ...split(run(cfg)) }));
  const isE = rows.map((r) => mean(r.is.map((t) => t.r)));
  const oosE = rows.map((r) => mean(r.oos.map((t) => t.r)));
  console.log(`\ngrade ${rows.length} configs · OOS>0: ${oosE.filter((e) => e > 0).length} · IS>0 e OOS>0: ${rows.filter((_, i) => (isE[i] as number) > 0 && (oosE[i] as number) > 0).length} · Spearman(IS,OOS)=${spearman(isE, oosE).toFixed(2)}`);

  const order = rows.map((_, i) => i).sort((a, b) => (isE[b] as number) - (isE[a] as number));
  const best = rows[order[0] as number]!;
  const cfg = best.cfg;
  console.log(`\n== escolhido só pelo IS: ${cfgKey(cfg)} ==`);
  console.log("base (entrada no fechamento)   IS", fmt(best.is.map((t) => t.r)), "| OOS", fmt(best.oos.map((t) => t.r)));
  const no = split(run(cfg, cost, true));
  console.log("entrada na abertura seguinte   IS", fmt(no.is.map((t) => t.r)), "| OOS", fmt(no.oos.map((t) => t.r)));
  const c2 = split(run(cfg, cost * 2));
  console.log(`custo ${Number(costArg) * 2} bps/lado               IS`, fmt(c2.is.map((t) => t.r)), "| OOS", fmt(c2.oos.map((t) => t.r)));

  // amplitude por ativo
  const bySym = (ts: Trade[]) => {
    const m = new Map<string, number>();
    for (const t of ts) m.set(t.symbol, (m.get(t.symbol) ?? 0) + t.r);
    return m;
  };
  const oosSym = bySym(best.oos);
  const sorted = [...oosSym.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const top3 = sorted.slice(0, 3).reduce((s, [, v]) => s + v, 0);
  console.log(`amplitude OOS: ${sorted.filter(([, v]) => v > 0).length}/${sorted.length} ativos com somaR>0 · top3 = ${((top3 / total) * 100).toFixed(0)}% da somaR (${sorted.slice(0, 3).map(([s, v]) => `${s} ${v.toFixed(1)}`).join(", ")}) · sem top3 somaR=${(total - top3).toFixed(1)}`);

  // por ano
  const years = new Map<number, number[]>();
  for (const t of [...best.is, ...best.oos]) {
    const y = new Date(t.time).getUTCFullYear();
    years.set(y, [...(years.get(y) ?? []), t.r]);
  }
  for (const [y, rs] of [...years.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${y}: ${fmt(rs)}`);

  // 3. teste nulo no OOS
  const nullTest = (useTrend: boolean) => {
    const rnd = rng(20260929);
    const perSym = new Map<string, number>();
    for (const t of best.oos) perSym.set(t.symbol, (perSym.get(t.symbol) ?? 0) + 1);
    const pools = new Map<string, { p: Prepared; bars: number[] }>();
    for (const { sym, p } of assets) {
      if (!perSym.has(sym)) continue;
      const bars: number[] = [];
      for (let t = 210; t < p.cs.length - 1; t++) {
        const c = p.cs[t] as Candle;
        if (c.openTime < cut) continue;
        if (useTrend && !(c.close > (p.ema200[t] as number))) continue;
        bars.push(t);
      }
      pools.set(sym, { p, bars });
    }
    const actual = mean(best.oos.map((t) => t.r));
    const means: number[] = [];
    for (let it = 0; it < iters; it++) {
      const rs: number[] = [];
      for (const [sym, n] of perSym) {
        const pool = pools.get(sym);
        if (!pool || !pool.bars.length) continue;
        for (let k = 0; k < n; k++) {
          const t = pool.bars[Math.floor(rnd() * pool.bars.length)] as number;
          const s = simulateFrom(pool.p, t, 1, cfg, cost);
          if (s) rs.push(s.r);
        }
      }
      means.push(mean(rs));
    }
    means.sort((a, b) => a - b);
    const p = means.filter((m) => m >= actual).length / means.length;
    return `nulo ${useTrend ? "(acima da EMA200)" : "(qualquer candle)"}: E mediana=${(means[Math.floor(iters / 2)] as number).toFixed(3)} p95=${(means[Math.floor(iters * 0.95)] as number).toFixed(3)} · rompimento E=${actual.toFixed(3)} · p=${p.toFixed(3)}`;
  };
  if (cfg.side === "long") {
    console.log(`\n== teste nulo OOS (${iters} sorteios, mesma saída, long) ==`);
    console.log(nullTest(true));
    console.log(nullTest(false));
  }

  // 4. split invertido: seleciona no período final (OOS original), testa no inicial
  const orderRev = rows.map((_, i) => i).sort((a, b) => (oosE[b] as number) - (oosE[a] as number));
  const bestRev = rows[orderRev[0] as number]!;
  console.log(`\n== split invertido: melhor no período final = ${cfgKey(bestRev.cfg)} ==`);
  console.log("final (seleção)", fmt(bestRev.oos.map((t) => t.r)), "| inicial (teste)", fmt(bestRev.is.map((t) => t.r)));
  console.log(`top 5 do IS → OOS: ${order.slice(0, 5).map((i) => (oosE[i] as number).toFixed(2)).join(" / ")} · top 5 do final → inicial: ${orderRev.slice(0, 5).map((i) => (isE[i] as number).toFixed(2)).join(" / ")}`);
  const longTrend = rows.filter((r) => r.cfg.side === "long" && r.cfg.trend);
  console.log(`família long+EMA200 (${longTrend.length} configs): IS E médio=${mean(longTrend.map((r) => mean(r.is.map((t) => t.r)))).toFixed(3)} · OOS E médio=${mean(longTrend.map((r) => mean(r.oos.map((t) => t.r)))).toFixed(3)} · min OOS=${Math.min(...longTrend.map((r) => mean(r.oos.map((t) => t.r)))).toFixed(3)}`);
  void stats;
}
main();
