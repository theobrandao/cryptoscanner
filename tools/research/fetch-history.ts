/**
 * Baixa histórico longo de klines spot (Binance, base pública de dados) para a pesquisa de calibração.
 *   npx tsx tools/research/fetch-history.ts <saida.json> [bars4h=3000] [bars1d=1100] [bars1w=260]
 */
import { writeFileSync } from "node:fs";
import { ASSETS } from "@/lib/assets";
import type { Candle } from "@/types/market";

const BASE = "https://data-api.binance.vision";
type K = [number, string, string, string, string, string, number, string];

async function klines(pair: string, interval: string, bars: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let endTime: number | undefined;
  while (out.length < bars) {
    const limit = Math.min(1000, bars - out.length);
    const url = `${BASE}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}${endTime ? `&endTime=${endTime}` : ""}`;
    let raw: K[] | null = null;
    for (let a = 0; a < 3 && !raw; a++) {
      const r = await fetch(url);
      if (r.ok) raw = (await r.json()) as K[];
      else await new Promise((ok) => setTimeout(ok, 1000 * (a + 1)));
    }
    if (!raw || !raw.length) break;
    out.unshift(...raw.map((k) => ({ openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: k[6], quoteVolume: +k[7] })));
    endTime = raw[0]![0] - 1;
    if (raw.length < limit) break;
  }
  // só candles fechados
  return out.filter((c) => c.closeTime < Date.now());
}

async function main() {
  const [, , outFile = "history.json", b4 = "3000", b1d = "1100", b1w = "260"] = process.argv;
  const data: Record<string, { "4h": Candle[]; "1d": Candle[]; "1w": Candle[] }> = {};
  for (const a of ASSETS) {
    const row = { "4h": await klines(a.binancePair, "4h", +b4), "1d": await klines(a.binancePair, "1d", +b1d), "1w": await klines(a.binancePair, "1w", +b1w) };
    data[a.symbol] = row;
    console.log(a.symbol, row["4h"].length, row["1d"].length, row["1w"].length);
  }
  writeFileSync(outFile, JSON.stringify(data));
}
void main();
