"use client";

import * as React from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { Bot, Loader2, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveSelection, selectionKey } from "@/hooks/use-market-selection";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, postJson } from "@/lib/client-api";
import { INSTRUMENT_LABEL, VENUE_LABEL } from "@/lib/venues";
import { cn } from "@/lib/utils";
import { trackClient } from "@/lib/analytics-client";
import type { AnalystReply } from "@/services/ai-analyst-service";

/**
 * AI Analyst — botão neutro na barra superior + painel lateral. Sempre lê o contexto global ativo
 * (ativo × exchange × instrumento × timeframe); resposta de um contexto anterior é descartada.
 */
export function AiAnalystButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          trackClient("analyst_open");
        }}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-muted", className)}
        aria-label="Analista IA"
      >
        <Bot className="h-4 w-4 text-primary" />
        <span className="hidden md:inline">Analista IA</span>
      </button>
      <AiAnalystPanel open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AiAnalystPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useSession();
  const { selection, version } = useActiveSelection();
  const [reply, setReply] = React.useState<AnalystReply | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const versionRef = React.useRef(version);
  React.useEffect(() => {
    versionRef.current = version;
  }, [version]);
  const key = selectionKey(selection);

  const ask = React.useCallback(
    async (q?: string) => {
      const v = versionRef.current;
      setBusy(true);
      setError(null);
      try {
        const r = await postJson<AnalystReply>(`/api/markets/${selection.symbol}/analyst`, {
          tf: selection.timeframe,
          exchange: selection.exchange,
          instrument: selection.instrument,
          question: q || undefined,
          contextKey: key,
        });
        // descarta resposta se o contexto mudou durante a requisição
        if (versionRef.current === v && r.contextKey === key) setReply(r);
      } catch (err) {
        if (versionRef.current === v) setError(err instanceof ApiClientError ? err.message : String(err));
      } finally {
        if (versionRef.current === v) setBusy(false);
      }
    },
    [selection, key],
  );

  // contexto mudou: limpa a resposta anterior (nunca mostra análise de outro ativo/timeframe)
  const [shownKey, setShownKey] = React.useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setReply(null);
    setError(null);
  }

  React.useEffect(() => {
    if (!open || !user || reply || busy || error) return;
    const id = setTimeout(() => void ask(), 0);
    return () => clearTimeout(id);
  }, [open, user, reply, busy, error, ask]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-full max-w-[440px] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-l p-0 sm:rounded-none">
        <DialogHeader className="border-b border-border p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" /> Analista IA
          </DialogTitle>
          <DialogDescription className="text-xs">
            {selection.symbol}/USDT · {VENUE_LABEL[selection.exchange]} {INSTRUMENT_LABEL[selection.instrument]} · {selection.timeframe.toUpperCase()} — usa só os números do contexto exibido.
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-[calc(100%-132px)] flex-col gap-3 overflow-y-auto p-4 text-[13px]">
          {!user ? (
            <p className="text-muted-foreground">
              <Link href="/login" className="text-primary underline">
                Entre
              </Link>{" "}
              ou comece o teste grátis de {TRIAL_DAYS} dias para usar o Analista IA.
            </p>
          ) : null}
          {busy && !reply ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo o contexto…
            </div>
          ) : null}
          {error ? <p className="rounded-md border border-danger/30 bg-danger/10 p-2 text-danger">{error}</p> : null}
          {reply ? (
            <>
              <p className="font-semibold leading-snug">{reply.headline}</p>
              {reply.interpretation ? (
                <section className="rounded-md border border-border bg-elevated p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Interpretação (números verificados no contexto)</h3>
                  <p className="leading-relaxed">{reply.interpretation.summary}</p>
                  {reply.interpretation.risks.length ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-warning">
                      {reply.interpretation.risks.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  {reply.interpretation.watch.length ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {reply.interpretation.watch.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : reply.guardrail.detail ? (
                <p className="text-[11.5px] text-muted-foreground">{reply.guardrail.detail}</p>
              ) : null}
              {reply.sections.map((s) => (
                <section key={s.title}>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</h3>
                  <ul className="space-y-1">
                    {s.lines.map((l) => (
                      <li key={l} className={cn("leading-snug", /^NO TRADE|LOW SAMPLE/.test(l) && "text-warning")}>
                        {l}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-[10.5px] text-muted-foreground">{reply.disclaimer}</p>
            </>
          ) : null}
        </div>
        <form
          className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length >= 2) void ask(question.trim());
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="Pergunte sobre este contexto…"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            disabled={!user}
          />
          <button type="submit" disabled={!user || busy} className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50" aria-label="Enviar">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="grid h-9 w-9 place-items-center rounded-md border border-border sm:hidden" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
