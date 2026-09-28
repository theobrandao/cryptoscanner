import { getCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";

const log = createLogger("whales");

/**
 * Grandes transações on-chain de Bitcoin a partir dos blocos mais recentes (blockchain.info, público, sem chave).
 * Classificação por forma da transação (sem rotulagem de carteiras de corretoras — isso só existe em serviços pagos):
 *  - consolidação: muitas entradas → poucas saídas
 *  - distribuição: poucas entradas → muitas saídas
 *  - transferência: 1–2 entradas → 1–2 saídas
 * Coletado pelo cron (bloco de ~8 MB; leva dezenas de segundos) e servido do cache.
 */
export interface WhaleTx {
  hash: string;
  time: number; // epoch ms
  blockHeight: number;
  btc: number;
  usd: number | null;
  inputs: number;
  outputs: number;
  kind: "consolidacao" | "distribuicao" | "transferencia";
  largestOutputBtc: number;
}

export interface WhaleSnapshot {
  updatedAt: number;
  lastBlock: { height: number; hash: string; time: number } | null;
  thresholdBtc: number;
  items: WhaleTx[];
  totalBtc24h: number;
  count24h: number;
}

const KEY = "onchain:whales";
const SEEN_KEY = "onchain:whales:lastblock";
const RETENTION_MS = 24 * 3600_000;

interface RawBlock {
  hash: string;
  height: number;
  time: number;
  tx: Array<{ hash: string; time: number; inputs: Array<{ prev_out?: { value: number } }>; out: Array<{ value: number }> }>;
}

export async function getWhaleSnapshot(): Promise<WhaleSnapshot | null> {
  return getCache().get<WhaleSnapshot>(KEY);
}

/**
 * Coleta o bloco mais recente (se ainda não processado), extrai transações ≥ threshold e mescla com as 24 h anteriores.
 */
export async function collectWhales(options: { thresholdBtc?: number; btcUsd?: number | null; timeoutMs?: number } = {}): Promise<{ processed: boolean; block?: number; found: number; total: number }> {
  const threshold = options.thresholdBtc ?? 50;
  const cache = getCache();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  try {
    const hashRes = await fetch("https://blockchain.info/q/latesthash", { signal: controller.signal, cache: "no-store" });
    if (!hashRes.ok) throw new Error(`latesthash HTTP ${hashRes.status}`);
    const hash = (await hashRes.text()).trim();
    const previous = (await cache.get<WhaleSnapshot>(KEY)) ?? { updatedAt: 0, lastBlock: null, thresholdBtc: threshold, items: [], totalBtc24h: 0, count24h: 0 };
    const seen = await cache.get<string>(SEEN_KEY);
    if (seen === hash) return { processed: false, found: 0, total: previous.items.length };

    const blockRes = await fetch(`https://blockchain.info/rawblock/${hash}`, { signal: controller.signal, cache: "no-store" });
    if (!blockRes.ok) throw new Error(`rawblock HTTP ${blockRes.status}`);
    const block = (await blockRes.json()) as RawBlock;
    const found: WhaleTx[] = [];
    for (const t of block.tx) {
      const outSats = t.out.reduce((s, o) => s + (o.value ?? 0), 0);
      const btc = outSats / 1e8;
      if (btc < threshold) continue;
      const ins = t.inputs.length;
      const outs = t.out.length;
      const kind: WhaleTx["kind"] = ins >= 5 && outs <= 2 ? "consolidacao" : ins <= 2 && outs >= 5 ? "distribuicao" : "transferencia";
      found.push({
        hash: t.hash,
        time: (t.time || block.time) * 1000,
        blockHeight: block.height,
        btc: Math.round(btc * 100) / 100,
        usd: options.btcUsd ? Math.round(btc * options.btcUsd) : null,
        inputs: ins,
        outputs: outs,
        kind,
        largestOutputBtc: Math.round((Math.max(...t.out.map((o) => o.value ?? 0)) / 1e8) * 100) / 100,
      });
    }
    const cutoff = Date.now() - RETENTION_MS;
    const merged = [...found, ...previous.items.filter((i) => i.time >= cutoff && i.blockHeight !== block.height)].sort((a, b) => b.time - a.time || b.btc - a.btc).slice(0, 200);
    const snapshot: WhaleSnapshot = {
      updatedAt: Date.now(),
      lastBlock: { height: block.height, hash: block.hash, time: block.time * 1000 },
      thresholdBtc: threshold,
      items: merged,
      totalBtc24h: Math.round(merged.reduce((s, i) => s + i.btc, 0) * 100) / 100,
      count24h: merged.length,
    };
    await cache.set(KEY, snapshot, 48 * 3600);
    await cache.set(SEEN_KEY, hash, 48 * 3600);
    log.info("bloco processado", { height: block.height, txs: block.tx.length, found: found.length });
    return { processed: true, block: block.height, found: found.length, total: merged.length };
  } finally {
    clearTimeout(timer);
  }
}
