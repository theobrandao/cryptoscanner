import { connection } from "next/server";
import { getTickers, getUsdBrl } from "@/services/market/market-service";

/**
 * Server-Sent Events com os tickers dos 20 ativos. Fonte: cache alimentado pelo worker
 * (WebSocket Binance) ou REST com fallback; intervalo de 3 s; encerra quando o cliente desconecta.
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
      send("hello", { interval: 3000 });
      await tick();
      timer = setInterval(() => void tick(), 3000);
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      req.signal.addEventListener("abort", close);
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
