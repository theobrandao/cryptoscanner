"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  Bell,
  Sparkles,
  Check,
  History,
  Loader2,
  Plus,
  Send,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { MarkdownLite } from "@/components/analyst/markdown-lite";
import { useToast } from "@/components/providers/toast-provider";
import { useActiveSelection } from "@/hooks/use-market-selection";
import { useSession } from "@/hooks/use-session";
import { trackClient } from "@/lib/analytics-client";
import { apiFetch, ApiClientError, postJson } from "@/lib/client-api";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { INSTRUMENT_LABEL, VENUE_LABEL } from "@/lib/venues";
import { cn } from "@/lib/utils";
import type { AnalystAction, ChatEvent } from "@/services/analyst-chat-service";

/**
 * Conversa com o Analista IA: histórico por conversa, resposta em fluxo, indicador das ferramentas consultadas,
 * números não conferidos sinalizados e ações propostas (alerta) que só acontecem com o clique do usuário.
 */
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  unverified?: number[];
  actions?: AnalystAction[];
  streaming?: boolean;
  error?: string;
}

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: string;
  messages: number;
}

const TOOL_LABELS: Record<string, string> = {
  contexto_ativo: "Análise completa",
  sinais_modelo: "Sinais do modelo",
  scanner_padroes: "Scanner",
  taxa_acerto: "Taxa de acerto",
  panorama_mercado: "Panorama",
  cotacao: "Cotação",
  propor_alerta: "Alerta proposto",
};

const DISCLAIMER =
  "Leitura técnica com números das ferramentas do app. Não é recomendação de investimento.";

function suggestions(symbol: string, tf: string): string[] {
  const TF = tf.toUpperCase();
  return [
    `Resuma ${symbol} no ${TF}: estrutura, níveis e riscos`,
    "Quais sinais do modelo estão abertos agora?",
    `Que padrões o scanner vê no ${TF} hoje?`,
    "Como está o mercado hoje (dominância, medo e ganância)?",
    `Compare ${symbol} e ${symbol === "BTC" ? "ETH" : "BTC"} no 1D`,
    "Qual padrão tem a melhor taxa de acerto no 4H?",
  ];
}

/** Lê o fluxo SSE do POST e entrega cada evento. */
async function readSse(
  res: Response,
  onEvent: (e: ChatEvent) => void,
  signal: AbortSignal,
) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as ChatEvent);
      } catch {
        /* fragmento inválido */
      }
    }
  }
}

export function AnalystChat({
  className,
  compact,
  onNavigate,
}: {
  className?: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { user } = useSession();
  const { selection } = useActiveSelection();
  const { toast } = useToast();
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [llm, setLlm] = React.useState<boolean | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const { data: convs, mutate: refreshConvs } = useSWR<{
    items: ConversationItem[];
  }>(user && showHistory ? "/api/analyst/conversations" : null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activeTool]);

  const send = React.useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy || !user) return;
      trackClient("analyst_message");
      setInput("");
      setBusy(true);
      const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: q };
      const draftId = `a-${Date.now()}`;
      setMessages((m) => [
        ...m,
        userMsg,
        {
          id: draftId,
          role: "assistant",
          content: "",
          streaming: true,
          tools: [],
          actions: [],
        },
      ]);
      const patch = (fn: (m: Msg) => Msg) =>
        setMessages((list) => list.map((m) => (m.id === draftId ? fn(m) : m)));
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/analyst/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId ?? undefined,
            message: q,
            selection: {
              symbol: selection.symbol,
              tf: selection.timeframe,
              exchange: selection.exchange,
              instrument: selection.instrument,
            },
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new ApiClientError(
            res.status,
            (j?.error as { code?: string } | undefined)?.code ?? "error",
            j?.error?.message ?? `HTTP ${res.status}`,
          );
        }
        await readSse(
          res,
          (e) => {
            if (e.type === "meta") {
              setConversationId(e.conversationId);
              setLlm(e.llm);
            } else if (e.type === "text")
              patch((m) => ({ ...m, content: m.content + e.delta }));
            else if (e.type === "replace")
              patch((m) => ({ ...m, content: e.text }));
            else if (e.type === "tool") {
              setActiveTool(e.status === "start" ? e.label : null);
              if (e.status === "ok")
                patch((m) => ({
                  ...m,
                  tools: [...new Set([...(m.tools ?? []), e.name])],
                }));
            } else if (e.type === "action")
              patch((m) => ({
                ...m,
                actions: [...(m.actions ?? []), e.action],
              }));
            else if (e.type === "done")
              patch((m) => ({
                ...m,
                id: e.messageId,
                streaming: false,
                unverified: e.unverified,
                tools: e.tools,
              }));
            else if (e.type === "error")
              patch((m) => ({ ...m, streaming: false, error: e.message }));
          },
          ctrl.signal,
        );
      } catch (err) {
        const aborted = ctrl.signal.aborted;
        patch((m) => ({
          ...m,
          streaming: false,
          error: aborted
            ? "Cancelado."
            : err instanceof ApiClientError
              ? err.message
              : "Falha de conexão. Tente de novo.",
        }));
      } finally {
        setActiveTool(null);
        setBusy(false);
        abortRef.current = null;
        patch((m) => ({ ...m, streaming: false }));
      }
    },
    [busy, user, conversationId, selection],
  );

  const openConversation = async (id: string) => {
    try {
      const c = await apiFetch<{
        id: string;
        messages: Array<{
          id: string;
          role: string;
          content: string;
          meta: {
            tools?: string[];
            unverified?: number[];
            actions?: AnalystAction[];
          } | null;
        }>;
      }>(`/api/analyst/conversations/${id}`);
      setConversationId(c.id);
      setMessages(
        c.messages.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          tools: m.meta?.tools,
          unverified: m.meta?.unverified,
          actions: m.meta?.actions,
        })),
      );
      setShowHistory(false);
    } catch (err) {
      toast({
        title: "Não foi possível abrir a conversa",
        description: err instanceof ApiClientError ? err.message : String(err),
        variant: "danger",
      });
    }
  };
  const removeConversation = async (id: string) => {
    try {
      await apiFetch(`/api/analyst/conversations/${id}`, { method: "DELETE" });
      await refreshConvs();
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      toast({
        title: "Falha ao apagar",
        description: err instanceof ApiClientError ? err.message : String(err),
        variant: "danger",
      });
    }
  };
  const newConversation = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  };
  const createAlert = async (a: AnalystAction, msgId: string, idx: number) => {
    try {
      await postJson("/api/alerts", {
        symbol: a.symbol,
        kind: a.alertKind,
        threshold: a.threshold,
        timeframe: selection.timeframe,
      });
      toast({
        title: `Alerta criado: ${a.symbol} ${a.alertKind === "price_above" ? "acima de" : "abaixo de"} ${a.threshold}`,
        variant: "success",
      });
      setMessages((list) =>
        list.map((m) =>
          m.id === msgId
            ? {
                ...m,
                actions: (m.actions ?? []).map((x, i) =>
                  i === idx ? { ...x, note: `${x.note} · criado` } : x,
                ),
              }
            : m,
        ),
      );
      trackClient("analyst_action_alert");
    } catch (err) {
      toast({
        title: "Não foi possível criar o alerta",
        description: err instanceof ApiClientError ? err.message : String(err),
        variant: "danger",
      });
    }
  };

  const ctxLabel = `${selection.symbol}/USDT · ${VENUE_LABEL[selection.exchange]} ${INSTRUMENT_LABEL[selection.instrument]} · ${selection.timeframe.toUpperCase()}`;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {/* barra de contexto e ações */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11.5px] text-muted-foreground">
        <span className="truncate">{ctxLabel}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              "cursor-pointer inline-flex h-8 items-center gap-1 rounded-md px-2 hover:bg-muted",
              showHistory && "bg-muted text-foreground",
            )}
            aria-label="Conversas anteriores"
            disabled={!user}
          >
            <History className="h-3.5 w-3.5" />{" "}
            <span className="hidden sm:inline">Histórico</span>
          </button>
          <button
            onClick={newConversation}
            className="cursor-pointer inline-flex h-8 items-center gap-1 rounded-md px-2 hover:bg-muted"
            aria-label="Nova conversa"
          >
            <Plus className="h-3.5 w-3.5" />{" "}
            <span className="hidden sm:inline">Nova</span>
          </button>
        </div>
      </div>

      {/* histórico */}
      {showHistory ? (
        <div className="max-h-56 overflow-y-auto border-b border-border bg-muted/20 text-[12.5px]">
          {(convs?.items ?? []).length ? (
            convs!.items.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50"
              >
                <button
                  onClick={() => void openConversation(c.id)}
                  className="cursor-pointer min-w-0 flex-1 truncate text-left"
                >
                  {c.title}{" "}
                  <span className="text-muted-foreground">
                    · {c.messages} msg
                  </span>
                </button>
                <button
                  onClick={() => void removeConversation(c.id)}
                  className="cursor-pointer grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  aria-label="Apagar conversa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-3 py-2 text-muted-foreground">
              Nenhuma conversa salva.
            </p>
          )}
        </div>
      ) : null}

      {/* mensagens */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[13.5px]">
        {!user ? (
          <div className="rounded-lg border border-border bg-card p-4 text-muted-foreground">
            <Link
              href="/login?next=/analista"
              className="text-primary underline"
              onClick={onNavigate}
            >
              Entre
            </Link>{" "}
            ou comece o teste grátis de {TRIAL_DAYS} dias para conversar com o
            Analista IA.
          </div>
        ) : null}
        {user && !messages.length ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Analista IA
              </p>
              <p className="mt-1 text-muted-foreground">
                Pergunte sobre qualquer um dos 30 ativos. Eu consulto as
                ferramentas do app (análise completa, scanner, sinais do modelo,
                taxa de acerto, panorama) e respondo só com os números delas.
              </p>
              {llm === false ? (
                <p className="mt-2 text-warning">
                  No momento, a resposta será a leitura automática do contexto
                  da tela.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions(selection.symbol, selection.timeframe).map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-left text-[12.5px] hover:border-primary/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-2",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {m.role === "assistant" ? (
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : null}
              <div
                className={cn(
                  "min-w-0 max-w-[92%] rounded-2xl px-3.5 py-2.5",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card",
                )}
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <>
                    {m.content ? (
                      <MarkdownLite text={m.content} />
                    ) : m.streaming ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        {activeTool ? (
                          <>Consultando {activeTool}…</>
                        ) : (
                          <>Pensando…</>
                        )}
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : null}
                    {m.streaming && m.content && activeTool ? (
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        Consultando {activeTool}…
                      </p>
                    ) : null}
                    {m.error ? (
                      <p className="mt-1 text-[12.5px] text-danger">
                        {m.error}
                      </p>
                    ) : null}
                    {m.actions?.length ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {m.actions.map((a, i) => (
                          <button
                            key={`${m.id}-a${i}`}
                            onClick={() => void createAlert(a, m.id, i)}
                            disabled={/· criado$/.test(a.note)}
                            className="cursor-pointer inline-flex min-h-9 items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 text-left text-[12.5px] font-medium hover:bg-primary/20 disabled:opacity-60"
                          >
                            {/· criado$/.test(a.note) ? (
                              <Check className="h-4 w-4 text-info" aria-hidden />
                            ) : (
                              <Bell className="h-4 w-4 text-primary" />
                            )}
                            Criar alerta: {a.symbol}{" "}
                            {a.alertKind === "price_above"
                              ? "acima de"
                              : "abaixo de"}{" "}
                            {a.threshold}{" "}
                            <span className="font-normal text-muted-foreground">
                              — {a.note.replace(/ · criado$/, "")}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!m.streaming &&
                    (m.tools?.length || m.unverified?.length) ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {m.tools?.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-border px-2 py-0.5"
                          >
                            {TOOL_LABELS[t] ?? t}
                          </span>
                        ))}
                        {m.unverified?.length ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning"
                            title="Números que não constam nos dados das ferramentas"
                          >
                            <AlertTriangle className="h-3 w-3" /> não
                            conferidos: {m.unverified.slice(0, 4).join(", ")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              {m.role === "user" ? (
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* entrada */}
      <form
        className="border-t border-border bg-card p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={compact ? 1 : 2}
            maxLength={1500}
            placeholder={
              user
                ? `Pergunte sobre ${selection.symbol} ou o mercado…`
                : "Entre para conversar"
            }
            className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            disabled={!user || busy}
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="cursor-pointer grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border"
              aria-label="Parar"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!user || !input.trim()}
              className="cursor-pointer grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          {DISCLAIMER}
        </p>
      </form>
    </div>
  );
}
