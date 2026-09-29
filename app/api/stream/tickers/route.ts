import { connection } from "next/server";
import { getTickers, getUsdBrl } from "@/services/market/market-service";

/** Limite por invocação em plataformas serverless; o cliente (EventSource) reconecta sozinho. */
export const maxDuration = 60;
const STREAM_MAX_MS = 50_000;

/**
 * Server-Sent Events com os tickers dos 30 ativos. Fonte: cache alimentado pelo worker
 * (WebSocket Binance) ou REST com fallback; intervalo de 3 s; encerra quando o cliente desconecta
 * ou após STREAM_MAX_MS (o navegador reabre a conexão automaticamente).
 */
export async function GET(req: Request) {
  await connection();
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
          send("error", { message: (err as Error).message });
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
