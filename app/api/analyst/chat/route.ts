import { connection } from "next/server";
import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { enforceRateLimit, handleError, parseBody, requireUser } from "@/lib/api";
import { isLlmConfigured } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { parseTimeframe } from "@/lib/timeframes";
import { INSTRUMENTS, VENUES } from "@/lib/venues";
import { runAnalystChat, type ChatEvent } from "@/services/analyst-chat-service";
import { consumeAiQuota, type AiQuotaTicket } from "@/services/ai-quota-service";
import { requireEntitlement, requireTimeframe } from "@/services/subscription-service";

export const maxDuration = 120;
const log = createLogger("analyst-chat");
/** Eventos enviados pela rota: os do serviço mais o erro com código estável. */
type RouteEvent = ChatEvent | { type: "error"; code: "llm_failed" | "cancelled"; message: string };

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
 * Conversa com o Analista IA (Server-Sent Events). Cada mensagem respondida pelo modelo consome 1 da cota diária
 * do plano (estornada se a resposta falhar). Eventos: meta, tool, text, replace, action, done, error.
 * O evento `error` leva `code` estável (`llm_failed`, `cancelled`) e texto fixo em português.
 */
export async function POST(req: Request) {
  await connection();
  let prepared: { userId: string; body: z.infer<typeof bodySchema>; tier: string; timeframes: string[]; tf: ReturnType<typeof parseTimeframe>; ticket: AiQuotaTicket | null };
  try {
    await enforceRateLimit(req, "public");
    const user = await requireUser(req);
    const access = await requireEntitlement(user);
    const body = await parseBody(req, bodySchema);
    const tf = parseTimeframe(body.selection.tf);
    requireTimeframe(access, tf, "analyst");
    await enforceRateLimit(req, "llm", `u:${user.id}`);
    // sem modelo configurado a resposta é a leitura automática do contexto: não consome cota
    const ticket = isLlmConfigured() ? await consumeAiQuota(user.id, access.tier) : null;
    prepared = { userId: user.id, body, tier: access.tier, timeframes: access.entitlements.timeframes, tf, ticket };
  } catch (err) {
    return handleError(err);
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: RouteEvent) => {
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
        // cancelada pelo usuário: o modelo já foi chamado, a cota fica debitada
        if (!abort.signal.aborted) await prepared.ticket?.refund();
        send(abort.signal.aborted ? { type: "error", code: "cancelled", message: "Resposta cancelada." } : { type: "error", code: "llm_failed", message: "O Analista IA falhou nesta resposta. Tente de novo. Esta mensagem não contou na sua cota do dia." });
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
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
