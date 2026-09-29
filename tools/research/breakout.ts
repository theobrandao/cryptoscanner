/**
 * Hipótese alternativa (definida antes do teste): rompimento de canal (Donchian) com saída por trailing,
 * família de seguimento de tendência. Mesmo protocolo: IS = 60% iniciais do tempo, OOS = 40% finais,
 * custos por lado, uma posição por ativo, grade pequena (32 configurações).
 *   npx tsx tools/research/breakout.ts <history.json> <tf 1d|4h> [custoBpsPorLado=15]
 */
import { readFileSync } from "node:fs";
import { cfgKey, fmt, grid, mean, prepare, runStrategy, type Hist } from "./breakout-lib";

function main() {
  const [, , file, tf = "1d", costArg = "15"] = process.argv;
  const hist = JSON.parse(readFileSync(file as string, "utf8")) as Hist;
  const cost = Number(costArg) / 10_000;
  const assets = Object.entries(hist)
    .filter(([, h]) => (h[tf]?.length ?? 0) >= 300)
    .map(([sym, h]) => ({ sym, p: prepare(h[tf]!) }));
  const times = assets.flatMap((a) => a.p.cs.map((c) => c.openTime)).sort((a, b) => a - b);
  const start = times[0] as number;
  const end = times[times.length - 1] as number;
  const cut = start + 0.6 * (end - start);
  console.log(`${tf} · IS até ${new Date(cut).toISOString().slice(0, 10)} · custo ${costArg} bps/lado`);
  const res = grid().map((cfg) => {
    const ts = assets.flatMap(({ sym, p }) => runStrategy(sym, p, cfg, cost)).sort((a, b) => a.time - b.time);
    return { cfg, is: ts.filter((t) => t.time < cut).map((t) => t.r), oos: ts.filter((t) => t.time >= cut).map((t) => t.r) };
  });
  res.sort((a, b) => mean(b.is) - mean(a.is));
  for (const r of res) console.log(cfgKey(r.cfg).padEnd(40), "IS", fmt(r.is), "| OOS", fmt(r.oos));
  const posOos = res.filter((r) => mean(r.oos) > 0).length;
  console.log(`\nconfigurações com OOS > 0: ${posOos}/${res.length} · melhor do IS no OOS: ${fmt(res[0]!.oos)}`);
}
main();
