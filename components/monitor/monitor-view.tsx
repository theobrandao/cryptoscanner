"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { BellRing, Pause, Play, Trash2 } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AccessGate, useAccess } from "@/components/account/access-gate";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/providers/toast-provider";
import { errorMessage, postJson } from "@/lib/client-api";
import { ASSETS } from "@/lib/assets";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INSTRUMENT_LABEL, INSTRUMENTS, isInstrument, isVenue, VENUE_LABEL, VENUES, type Instrument, type Venue } from "@/lib/venues";
import type { Timeframe } from "@/types/market";

interface MonitorRow {
  id: string;
  symbol: string;
  timeframe: string;
  exchange: Venue;
  instrument: Instrument;
  kind: "SETUP" | "STRATEGY";
  strategy: { id: string; name: string } | null;
  states: string[];
  minScore: number;
  notifyPush: boolean;
  notifyTelegram: boolean;
  active: boolean;
  lastState: string | null;
  lastScore: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}
interface EventRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  channels: string[];
  readAt: string | null;
  createdAt: string;
}

const TFS: Timeframe[] = ["15m", "30m", "1h", "4h", "1d", "1w"];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring";

function MonitorInner() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { data, error, mutate } = useSWR<{ items: MonitorRow[]; limit: number; states: string[] }>("/api/monitors");
  const { data: events, error: eventsError, mutate: mutateEvents } = useSWR<{ items: EventRow[]; unread: number }>("/api/monitors/events?limit=50", { refreshInterval: 60_000 });
  const { access } = useAccess();
  // tempos gráficos do plano (abaixo de 4H só no ELITE); sem a resposta ainda, não bloqueia a lista
  const allowedTfs = access?.entitlements.timeframes ?? null;
  const { data: strategies } = useSWR<{ items: Array<{ id: string; name: string }> }>("/api/strategies", { revalidateOnFocus: false });
  const presetStrategy = params.get("strategy");
  const [kind, setKind] = React.useState<"SETUP" | "STRATEGY">(presetStrategy ? "STRATEGY" : "SETUP");
  const [symbol, setSymbol] = React.useState((params.get("symbol") ?? "BTC").toUpperCase());
  const [tf, setTf] = React.useState<Timeframe>((TFS.includes(params.get("tf") as Timeframe) ? params.get("tf") : "4h") as Timeframe);
  const [exchange, setExchange] = React.useState<Venue>(isVenue(params.get("exchange")) ? (params.get("exchange") as Venue) : "binance");
  const [instrument, setInstrument] = React.useState<Instrument>(isInstrument(params.get("instrument")) ? (params.get("instrument") as Instrument) : "spot");
  const [strategyId, setStrategyId] = React.useState(presetStrategy ?? "");
  const [states, setStates] = React.useState<string[]>(["READY", "TRIGGERED", "INVALIDATED", "TARGET_HIT"]);
  const [minScore, setMinScore] = React.useState(60);
  const [push, setPush] = React.useState(true);
  const [telegram, setTelegram] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const fail = (t: string, err: unknown) => toast({ title: t, description: errorMessage(err), variant: "danger" });
  const create = async () => {
    setBusy(true);
    try {
      await postJson("/api/monitors", { symbol, timeframe: tf, exchange, instrument, kind, strategyId: kind === "STRATEGY" ? strategyId : null, states, minScore, notifyPush: push, notifyTelegram: telegram });
      await mutate();
      toast({ title: "Monitor criado", description: "Avaliado no servidor a cada ciclo; você recebe o aviso mesmo com o navegador fechado.", variant: "success" });
    } catch (err) {
      fail("Não foi possível criar", err);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (m: MonitorRow) => {
    try {
      await postJson(`/api/monitors/${m.id}`, { active: !m.active }, "PATCH");
      await mutate();
    } catch (err) {
      fail("Falha ao atualizar", err);
    }
  };
  const remove = async (m: MonitorRow) => {
    try {
      await postJson(`/api/monitors/${m.id}`, {}, "DELETE");
      await mutate();
    } catch (err) {
      fail("Falha ao excluir", err);
    }
  };
  const readAll = async () => {
    await postJson("/api/monitors/events/read", {});
    await mutateEvents();
  };

  return (
    <PageShell className="max-w-[1400px]">
      <PageTitle
        title="Monitores"
        description="Monitores rodam no servidor a cada ciclo (5 min): estado do setup (READY, TRIGGERED, INVALIDATED…) ou uma estratégia salva. Cada fato notifica uma única vez (deduplicação por impressão digital)."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-3 text-[14px] font-semibold">Novo monitor</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-border p-0.5 text-[12.5px]" role="radiogroup" aria-label="Tipo">
                {(["SETUP", "STRATEGY"] as const).map((k) => (
                  <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("h-8 rounded px-3", kind === k ? "bg-primary/15 font-semibold" : "text-muted-foreground")}>
                    {k === "SETUP" ? "Setup" : "Estratégia"}
                  </button>
                ))}
              </div>
              <select aria-label="Ativo" className={sel} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}/USDT
                  </option>
                ))}
              </select>
              {kind === "SETUP" ? (
                <select aria-label="Timeframe" className={sel} value={tf} onChange={(e) => setTf(e.target.value as Timeframe)}>
                  {TFS.map((t) => {
                    const locked = allowedTfs !== null && !allowedTfs.includes(t);
                    return (
                      <option key={t} value={t} disabled={locked}>
                        {t.toUpperCase()}
                        {locked ? " (ELITE)" : ""}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <select aria-label="Estratégia" className={sel} value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
                  <option value="">Escolha a estratégia</option>
                  {(strategies?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <select aria-label="Exchange" className={sel} value={exchange} onChange={(e) => setExchange(e.target.value as Venue)}>
                {VENUES.map((v) => (
                  <option key={v} value={v}>
                    {VENUE_LABEL[v]}
                  </option>
                ))}
              </select>
              <select aria-label="Instrumento" className={sel} value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)}>
                {INSTRUMENTS.map((v) => (
                  <option key={v} value={v}>
                    {INSTRUMENT_LABEL[v]}
                  </option>
                ))}
              </select>
            </div>
            {kind === "SETUP" ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-muted-foreground">Notificar em:</span>
                {(data?.states ?? ["FORMING", "READY", "TRIGGERED", "ACTIVE", "TARGET_HIT", "INVALIDATED", "EXPIRED"]).map((s) => (
                  <button key={s} aria-pressed={states.includes(s)} onClick={() => setStates((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} className={cn("h-7 rounded-full border px-2.5 text-[11px]", states.includes(s) ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}>
                    {s.replace("_", " ")}
                  </button>
                ))}
                <label className="ml-2 flex items-center gap-1.5 text-[12px]">
                  Score ≥
                  <input type="number" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value))))} className={cn(sel, "h-7 w-16")} aria-label="Score mínimo" />
                </label>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-muted-foreground">Notifica quando todas as condições passam a valer no fechamento de um candle (transição falso → verdadeiro).</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Push no navegador
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} /> Telegram
              </label>
              <span className="text-[11px] text-muted-foreground">No app sempre. Push e Telegram configurados em Preferências.</span>
              <button onClick={() => void create()} disabled={busy || (kind === "STRATEGY" && !strategyId)} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
                <BellRing className="h-4 w-4" /> Criar monitor
              </button>
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[13px]">
              <span className="font-semibold">Monitores</span>
              <span className="text-muted-foreground">{data ? `${data.items.length}/${data.limit}` : "…"}</span>
            </div>
            {data && data.items.length === 0 ? <p className="p-3 text-[12.5px] text-muted-foreground">Nenhum monitor. Crie um acima ou pelo botão “Monitorar” na Análise completa.</p> : null}
            <ul className="divide-y divide-border">
              {(data?.items ?? []).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
                  <span className={cn("h-2 w-2 rounded-full", m.active ? (m.lastError ? "bg-warning" : "bg-success") : "bg-muted-foreground/50")} />
                  <Link href={`/charts/${m.symbol}?tf=${m.timeframe}&exchange=${m.exchange}&instrument=${m.instrument}`} className="font-semibold hover:underline">
                    {m.symbol}/USDT {m.kind === "SETUP" ? m.timeframe.toUpperCase() : ""}
                  </Link>
                  <span className="text-muted-foreground">
                    {VENUE_LABEL[m.exchange]} {INSTRUMENT_LABEL[m.instrument]} · {m.kind === "SETUP" ? `setup · ${m.states.join(", ")} · score ≥ ${m.minScore}` : `estratégia “${m.strategy?.name ?? "removida"}”`}
                  </span>
                  <span className="ml-auto text-[11.5px] text-muted-foreground" title={m.lastError ?? undefined}>
                    {m.lastState ? `${m.lastState}${m.lastScore != null ? ` · ${m.lastScore}` : ""}` : "aguardando 1º ciclo"} · {m.lastCheckedAt ? timeAgo(m.lastCheckedAt) : "—"}
                  </span>
                  <button onClick={() => void toggle(m)} className="grid h-7 w-7 place-items-center rounded hover:bg-muted" aria-label={m.active ? "Pausar" : "Retomar"}>
                    {m.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => void remove(m)} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-danger" aria-label="Excluir monitor">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {m.lastError ? <p className="w-full pl-5 text-[11px] text-warning">{m.lastError}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[13px]">
            <span className="font-semibold">Eventos {events?.unread ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[10.5px] text-primary-foreground">{events.unread}</span> : null}</span>
            {events?.unread ? (
              <button onClick={() => void readAll()} className="text-[11.5px] text-muted-foreground hover:text-foreground">
                Marcar como lidos
              </button>
            ) : null}
          </div>
          {events && events.items.length === 0 ? <p className="p-3 text-[12.5px] text-muted-foreground">Sem eventos ainda.</p> : null}
          <ul className="max-h-[640px] divide-y divide-border overflow-y-auto">
            {(events?.items ?? []).map((e) => (
              <li key={e.id} className={cn("px-3 py-2 text-[12.5px]", !e.readAt && "bg-primary/5")}>
                <div className="font-semibold">{e.title}</div>
                <p className="mt-0.5 text-muted-foreground">{e.body}</p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground" title={formatDateTime(e.createdAt)}>
                  {timeAgo(e.createdAt)} · {e.channels.join(" + ") || "in-app"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {error || eventsError ? (
        <Alert
          variant="danger"
          className="mt-3"
          title="Não foi possível carregar os monitores"
          action={
            <Button size="sm" variant="outline" onClick={() => void Promise.all([mutate(), mutateEvents()])}>
              Tentar novamente
            </Button>
          }
        >
          {errorMessage(error ?? eventsError)}
        </Alert>
      ) : !data ? (
        <Alert variant="info" className="mt-3">
          Carregando…
        </Alert>
      ) : null}
    </PageShell>
  );
}

export function MonitorView() {
  return (
    <AccessGate feature="Monitores">
      <MonitorInner />
    </AccessGate>
  );
}
