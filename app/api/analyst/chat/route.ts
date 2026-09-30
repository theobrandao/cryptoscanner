import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { ApiError, enforceRateLimit, handleError, parseBody, requireUser } from "@/lib/api";
import { getCache } from "@/lib/cache";
import { createLogger } from "@/lib/logger";
import { parseTimeframe } from "@/lib/timeframes";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { runAnalystChat, type ChatEvent } from "@/services/analyst-chat-service";
import { requireEntitlement } from "@/services/subscription-service";

export const maxDuration = 120;
const log = createLogger("analyst-chat");

const bodySchema = z.object({
  conversationId: z.string().max(40).nullish(),
  message: z.string().trim().min(1).max(1500),
  selection: z.object({
    symbol: symbolSchema,
    tf: z.string().default("4h"),
    exchange: z.enum(VENUES).default("binance"),
    instrument: z.enum(INSTRUMENTS).default("spot"),
  }),
});

/**
 * Conversa com o Analista IA (Server-Sent Events). Cada mensagem consome 1 da cota diária do plano.
 * Eventos: meta, tool, text, replace, action, done, error.
 */
export async function POST(req: Request) {
  await connection();
  let prepared: { userId: string; body: z.infer<typeof bodySchema>; tier: string; timeframes: string[]; tf: ReturnType<typeof parseTimeframe> };
  try {
    await enforceRateLimit(req, "public");
    const user = await requireUser(req);
    const access = await requireEntitlement(user);
    const body = await parseBody(req, bodySchema);
    const tf = parseTimeframe(body.selection.tf);
    if (!access.entitlements.timeframes.includes(tf)) throw new ApiError(402, `Timeframe ${tf} não incluído no seu plano`, "timeframe_locked");
    await enforceRateLimit(req, "llm", `u:${user.id}`);
    const day = new Date().toISOString().slice(0, 10);
    const used = await getCache().incr(`ai:quota:${user.id}:${day}`, 26 * 3600);
    if (used > access.entitlements.aiQueriesPerDay) throw new ApiError(429, `Limite diário de ${access.entitlements.aiQueriesPerDay} mensagens ao Analista IA atingido no seu plano`, "ai_quota");
    prepared = { userId: user.id, body, tier: access.tier, timeframes: access.entitlements.timeframes, tf };
  } catch (err) {
    return handleError(err);
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await runAnalystChat(
          {
            userId: prepared.userId,
            conversationId: prepared.body.conversationId ?? undefined,
            message: prepared.body.message,
            selection: { symbol: prepared.body.selection.symbol, tf: prepared.tf, exchange: prepared.body.selection.exchange, instrument: prepared.body.selection.instrument },
            tier: prepared.tier,
            timeframes: prepared.timeframes,
            signal: abort.signal,
          },
          send,
        );
      } catch (err) {
        log.error("conversa falhou", { error: (err as Error).message });
        send({ type: "error", message: abort.signal.aborted ? "cancelado" : "O Analista IA falhou nesta resposta. Tente de novo." });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
