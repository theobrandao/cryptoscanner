import { cached } from "@/lib/cache";
import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";

export interface FearGreed {
  value: number; // 0..100
  classification: string; // Extreme Fear .. Extreme Greed (texto da fonte)
  classificationPt: string;
  timestamp: number; // epoch ms
  source: string;
  history: Array<{ value: number; timestamp: number }>;
}

interface FngResponse {
  data: Array<{ value: string; value_classification: string; timestamp: string }>;
}

const PT: Record<string, string> = {
  "Extreme Fear": "Medo extremo",
  Fear: "Medo",
  Neutral: "Neutro",
  Greed: "Ganância",
  "Extreme Greed": "Ganância extrema",
};

/** Índice Medo & Ganância (alternative.me) — fonte pública, atualização diária. */
export async function getFearGreed(): Promise<{ data: FearGreed; stale: boolean }> {
  const res = await cached<FearGreed>(
    "sentiment:fng",
    1800,
    async () => {
      const url = `${getEnv().FNG_URL}?limit=8&format=json`;
      const raw = await fetchJson<FngResponse>(url, { retries: 1 });
      const first = raw.data[0];
      if (!first) throw new Error("fng: resposta vazia");
      return {
        value: Number(first.value),
        classification: first.value_classification,
        classificationPt: PT[first.value_classification] ?? first.value_classification,
        timestamp: Number(first.timestamp) * 1000,
        source: "alternative.me/fng",
        history: raw.data.map((d) => ({ value: Number(d.value), timestamp: Number(d.timestamp) * 1000 })),
      };
    },
    { staleTtlSeconds: 48 * 3600 },
  );
  return { data: res.value, stale: res.stale };
}
