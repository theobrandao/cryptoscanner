import { connection } from "next/server";
import { enforceRateLimit, handleError } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { getTickers, getUsdBrl } from "@/services/market/market-service";

const log = createLogger("stream-tickers");
/** Evento de erro estável: código fixo e texto em português (a causa fica só no log). */
const PROVIDER_ERROR = { code: "provider_unavailable", message: "Cotações indisponíveis no momento. Tentando de novo." } as const;

/** Limite por invocação em plataformas serverless; o cliente (EventSource) reconecta sozinho. */
export const maxDuration = 60;
const STREAM_MAX_MS = 50_000;

/**
 * Server-Sent Events com os tickers dos 30 ativos. Fonte: cache alimentado pelo worker
 * (WebSocket Binance) ou REST com fallback; intervalo de 3 s; encerra quando o cliente desconecta
 * ou após STREAM_MAX_MS (o navegador reabre a conexão automaticamente).
 * Limite de novas conexões por IP (balde `stream_tickers`); acima dele responde 429 e o cliente passa a consultar por REST.
 */
export async function GET(req: Request) {
  await connection();
  try {
    await enforceRateLimit(req, "stream_tickers");
  } catch (err) {
    return handleError(err);
  }
  const encoder = new TextEncoder();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const tick = async () => {
        try {
          const [res, fx] = await Promise.all([getTickers(), getUsdBrl()]);
          send("tickers", { ...res, usdBrl: fx.rate, sentAt: Date.now() });
        } catch (err) {
          log.warn("falha ao ler tickers", { error: (err as Error).message });
          send("error", PROVIDER_ERROR);
        }
      };
      if (!closed) controller.enqueue(encoder.encode("retry: 2000\n\n"));
      send("hello", { interval: 3000, maxMs: STREAM_MAX_MS });
      await tick();
      timer = setInterval(() => void tick(), 3000);
      let lifetime: NodeJS.Timeout | null = null;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        if (lifetime) clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      req.signal.addEventListener("abort", close);
      lifetime = setTimeout(close, STREAM_MAX_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
