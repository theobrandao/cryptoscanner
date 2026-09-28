"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Bot, Pause, Play, Plus, Radar, Send, Square, Trash2, Pencil, ExternalLink } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AgentWizard, CATEGORY_LABEL, EMPTY_DRAFT, type AgentDraft, type StrategyInfo } from "@/components/agents/agent-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";
import { formatDateTime, timeAgo } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types/market";

interface AgentDto {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  symbols: string[];
  operationType: "day_trade" | "swing_trade";
  timeframe: string;
  strategies: string[];
  minConfidence: number;
  notification: "log" | "telegram" | "both";
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  lastRunAt: string | null;
  lastAlertAt: string | null;
  createdAt: string;
  _count: { logs: number };
  logs: Array<{ message: string; level: string; createdAt: string }>;
}

interface AgentsPayload {
  items: AgentDto[];
  counts: Record<string, number>;
  limit: number;
}

interface LogItem {
  id: string;
  level: string;
  symbol: string | null;
  message: string;
  createdAt: string;
  agent: { id: string; name: string; icon: string };
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Ativo", PAUSED: "Pausado", STOPPED: "Parado" };

/** Presets do modal "Scanner de IA" observado na referência (lógica própria). */
const PRESETS: Array<{ key: string; title: string; desc: string; draft: Partial<AgentDraft> }> = [
  {
    key: "daytrade",
    title: "⚡ Day Trade 1D · 4H · 1H",
    desc: "Tendência primária + secundária + refinamento intradiário.",
    draft: { name: "Day Trade multi-TF", icon: "⚡", operationType: "day_trade", timeframe: "1h", strategies: ["daytrade_multi_tf", "stochrsi_bands"] },
  },
  {
    key: "swing",
    title: "🌊 Swing Trade 1W · 1D · 4H",
    desc: "Mesma profundidade de análise em timeframes maiores.",
    draft: { name: "Swing Trade multi-TF", icon: "🌊", operationType: "swing_trade", timeframe: "4h", strategies: ["swing_multi_tf", "ema_stack_trend", "pattern_breakout"] },
  },
  {
    key: "stochrsi",
    title: "📉 StochRSI 4H",
    desc: "Bandas 90/50/10 — pullbacks em tendência.",
    draft: { name: "StochRSI 4H", icon: "📉", operationType: "swing_trade", timeframe: "4h", strategies: ["stochrsi_bands"] },
  },
  {
    key: "ema100",
    title: "📈 EMA 100 + StochRSI",
    desc: "Pullbacks à EMA 100 com confluência extrema.",
    draft: { name: "EMA 100 + StochRSI", icon: "📈", operationType: "swing_trade", timeframe: "4h", strategies: ["ema100_stochrsi", "confluence"] },
  },
];

const TIMEFRAMES_OK = new Set(["15m", "30m", "1h", "4h", "1d", "1w"]);

/** Atalho vindo do scanner: /agentes?novo=1&symbol=BTC&timeframe=4h&strategy=pattern_breakout abre o wizard pré-preenchido. */
function draftFromQuery(q: URLSearchParams): { open: boolean; draft: AgentDraft } {
  if (q.get("novo") !== "1") return { open: false, draft: EMPTY_DRAFT };
  const symbol = (q.get("symbol") ?? "BTC").toUpperCase();
  const tf = q.get("timeframe") ?? "4h";
  const strategy = q.get("strategy") ?? "pattern_breakout";
  return {
    open: true,
    draft: {
      ...EMPTY_DRAFT,
      name: `Padrões ${symbol} ${tf.toUpperCase()}`,
      symbols: [symbol],
      timeframe: (TIMEFRAMES_OK.has(tf) ? tf : "4h") as AgentDraft["timeframe"],
      strategies: [strategy] as AgentDraft["strategies"],
    },
  };
}

export function AgentsView() {
  const { user, telegramConnected, loading: sessionLoading, refresh: refreshSession } = useSession();
  const plan = PLANS[user?.plan ?? "FREE"];
  const { toast } = useToast();
  const [status, setStatus] = React.useState<"ALL" | "ACTIVE" | "PAUSED" | "STOPPED">("ALL");
  const { data, error, isLoading, mutate } = useSWR<AgentsPayload>(user ? `/api/agents?status=${status}` : null, { refreshInterval: 30_000 });
  const { data: strategies } = useSWR<{ strategies: StrategyInfo[] }>("/api/agents/strategies");
  const { data: logs, mutate: refreshLogs } = useSWR<{ items: LogItem[] }>(user ? "/api/agents/logs?limit=60" : null, { refreshInterval: 10_000 });
  const searchParams = useSearchParams();
  const [wizard, setWizard] = React.useState<{ open: boolean; draft: AgentDraft }>(() => draftFromQuery(searchParams));
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const act = async (label: string, fn: () => Promise<unknown>, key = label) => {
    setBusy(key);
    try {
      await fn();
      await Promise.all([mutate(), refreshLogs()]);
    } catch (err) {
      toast({ title: "Ação falhou", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(null);
    }
  };

  if (sessionLoading)
    return (
      <PageShell>
        <Skeleton className="h-40" />
      </PageShell>
    );

  if (!user) {
    return (
      <PageShell>
        <PageTitle icon="🤖" title="Agentes de IA" description="Agentes autônomos que monitoram o mercado 24/7, avaliam estratégias e enviam alertas no painel ou no Telegram." />
        <Alert
          variant="info"
          title="Faça login para gerenciar seus Agentes de IA"
          action={
            <Link href="/login?next=/agentes" className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
              Entrar
            </Link>
          }
        >
          Seus agentes são salvos na nuvem e analisam o mercado 24/7 automaticamente, mesmo com o navegador fechado (verificação no servidor a cada 5 minutos).
        </Alert>
        <div className="mt-6">
          <StrategiesLibrary strategies={strategies?.strategies ?? []} />
        </div>
        <div className="mt-6">
          <SystemAgents />
        </div>
      </PageShell>
    );
  }

  const agents = data?.items ?? [];
  const total = Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0);

  return (
    <PageShell>
      <PageTitle
        icon="🤖"
        title="Agentes de IA"
        description={`Agentes autônomos verificados pelo servidor a cada 5 minutos. Plano ${plan.name}: até ${plan.maxAgents} agentes simultâneos.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setPresetsOpen(true)}>
              <Radar className="h-4 w-4" /> Scanner de IA
            </Button>
            <Button onClick={() => setWizard({ open: true, draft: EMPTY_DRAFT })}>
              <Plus className="h-4 w-4" /> Novo Agente
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Meus Agentes</CardTitle>
                <CardDescription>
                  {total} agente(s) · limite {data?.limit ?? plan.maxAgents}
                </CardDescription>
              </div>
              {total > 0 ? (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDeleteAll(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir Todos
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <TabsList>
                  <TabsTrigger value="ALL">Todos ({total})</TabsTrigger>
                  <TabsTrigger value="ACTIVE">Ativos ({data?.counts.ACTIVE ?? 0})</TabsTrigger>
                  <TabsTrigger value="PAUSED">Pausados ({data?.counts.PAUSED ?? 0})</TabsTrigger>
                  <TabsTrigger value="STOPPED">Parados ({data?.counts.STOPPED ?? 0})</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mt-3">
                {error ? (
                  <Alert variant="danger" title="Não foi possível carregar os agentes">
                    {error instanceof ApiClientError ? error.message : String(error)}
                  </Alert>
                ) : isLoading && !data ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-40" />
                    ))}
                  </div>
                ) : agents.length === 0 ? (
                  <EmptyState
                    icon="🤖"
                    title="Nenhum agente encontrado"
                    description="Crie seu primeiro agente escolhendo ativos, timeframe e estratégias. Ele será verificado a cada 5 minutos."
                    action={
                      <Button onClick={() => setWizard({ open: true, draft: EMPTY_DRAFT })}>
                        <Plus className="h-4 w-4" /> Criar Primeiro Agente
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {agents.map((a) => (
                      <AgentCard
                        key={a.id}
                        agent={a}
                        strategies={strategies?.strategies ?? []}
                        busy={busy}
                        onRun={() =>
                          act(
                            "run",
                            () =>
                              postJson<{ signals: unknown[]; alertsSent: number; skippedByCooldown: boolean }>(`/api/agents/${a.id}/run`, {}).then((r) =>
                                toast({
                                  title: `${a.icon} ${a.name} executado`,
                                  description: `${r.signals.length} sinal(is) acima da confiança mínima · ${r.alertsSent} alerta(s) enviado(s)${r.skippedByCooldown ? " · cooldown" : ""}`,
                                  variant: r.signals.length ? "success" : "default",
                                }),
                              ),
                            `run:${a.id}`,
                          )
                        }
                        onStatus={(s) => act("status", () => postJson(`/api/agents/${a.id}`, { status: s }, "PATCH"), `status:${a.id}`)}
                        onEdit={() =>
                          setWizard({
                            open: true,
                            draft: {
                              id: a.id,
                              name: a.name,
                              icon: a.icon,
                              description: a.description ?? "",
                              symbols: a.symbols,
                              operationType: a.operationType,
                              timeframe: a.timeframe as AgentDraft["timeframe"],
                              strategies: a.strategies,
                              minConfidence: a.minConfidence,
                              notification: a.notification,
                            },
                          })
                        }
                        onDelete={() => act("delete", () => apiFetch(`/api/agents/${a.id}`, { method: "DELETE" }), `delete:${a.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <StrategiesLibrary
            strategies={strategies?.strategies ?? []}
            onUse={(key) => setWizard({ open: true, draft: { ...EMPTY_DRAFT, name: strategies?.strategies.find((s) => s.key === key)?.name ?? "", strategies: [key] } })}
          />
          <SystemAgents />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                📋 Log de Operações em Tempo Real{" "}
                <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-success">
                  <span className="h-2 w-2 rounded-full bg-success live-dot" /> AO VIVO
                </span>
              </CardTitle>
              <CardDescription>Sinais, avisos e erros de todos os seus agentes (atualiza a cada 10 s).</CardDescription>
            </CardHeader>
            <CardContent>
              {!logs ? (
                <Skeleton className="h-40" />
              ) : logs.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma operação registrada ainda. Execute um agente ou aguarde o próximo ciclo do worker.</p>
              ) : (
                <ul className="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1 text-xs">
                  {logs.items.map((l) => (
                    <li
                      key={l.id}
                      className={cn(
                        "rounded-md border-l-2 bg-muted/40 px-2 py-1.5",
                        l.level === "signal" ? "border-l-success" : l.level === "error" ? "border-l-danger" : l.level === "warn" ? "border-l-warning" : "border-l-border",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>
                          {l.agent.icon} {l.agent.name}
                          {l.symbol ? ` · ${l.symbol}` : ""}
                        </span>
                        <span>{timeAgo(l.createdAt)}</span>
                      </div>
                      <div className={cn(l.level === "signal" && "font-medium")}>{l.message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <TelegramCard connected={telegramConnected} planAllows={plan.telegramAlerts} onChanged={() => void refreshSession()} />
        </div>
      </div>

      <AgentWizard
        open={wizard.open}
        onOpenChange={(o) => setWizard((w) => ({ ...w, open: o }))}
        initial={wizard.draft}
        plan={plan}
        telegramConnected={telegramConnected}
        onSaved={() => {
          void mutate();
          toast({ title: "✅ Agente criado com sucesso!", variant: "success" });
        }}
      />

      <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scanner de IA</DialogTitle>
            <DialogDescription>Escolha um preset; o wizard abre já preenchido para você revisar e ativar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setPresetsOpen(false);
                  setWizard({ open: true, draft: { ...EMPTY_DRAFT, ...p.draft } as AgentDraft });
                }}
                className="rounded-md border border-border p-3 text-left hover:bg-muted cursor-pointer"
              >
                <div className="font-semibold">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.desc}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir todos os agentes?</DialogTitle>
            <DialogDescription>Esta ação é irreversível: {total} agente(s) e seus logs serão removidos.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteAll(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={busy === "deleteAll"}
              onClick={() =>
                void act("deleteAll", async () => {
                  await apiFetch("/api/agents", { method: "DELETE" });
                  setConfirmDeleteAll(false);
                })
              }
            >
              <Trash2 className="h-4 w-4" /> Excluir Todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function AgentCard({
  agent,
  strategies,
  busy,
  onRun,
  onStatus,
  onEdit,
  onDelete,
}: {
  agent: AgentDto;
  strategies: StrategyInfo[];
  busy: string | null;
  onRun: () => void;
  onStatus: (s: AgentDto["status"]) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const last = agent.logs[0];
  return (
    <Card className={cn("border-l-4", agent.status === "ACTIVE" ? "border-l-success" : agent.status === "PAUSED" ? "border-l-warning" : "border-l-muted-foreground")}>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agent.icon}</span>
            <div>
              <div className="font-semibold leading-tight">{agent.name}</div>
              <div className="text-xs text-muted-foreground">
                {agent.operationType === "day_trade" ? "⚡ Day Trade" : "🌊 Swing Trade"} · {TIMEFRAME_LABEL[agent.timeframe as Timeframe] ?? agent.timeframe} · conf. ≥ {agent.minConfidence}%
              </div>
            </div>
          </div>
          <Badge variant={agent.status === "ACTIVE" ? "success" : agent.status === "PAUSED" ? "warning" : "muted"}>{STATUS_LABEL[agent.status]}</Badge>
        </div>
        {agent.description ? <p className="text-xs text-muted-foreground">{agent.description}</p> : null}
        <div className="flex flex-wrap gap-1">
          {agent.symbols.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {agent.strategies.map((k) => (
            <Badge key={k} variant="muted" className="normal-case tracking-normal">
              {strategies.find((s) => s.key === k)?.name ?? k}
            </Badge>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
          <span>Notificação: {{ log: "📋 Log", telegram: "✈️ Telegram", both: "🔔 Ambos" }[agent.notification]}</span>
          <span>Logs: {agent._count.logs}</span>
          <span>Última verificação: {agent.lastRunAt ? timeAgo(agent.lastRunAt) : "—"}</span>
          <span>Último alerta: {agent.lastAlertAt ? formatDateTime(agent.lastAlertAt) : "—"}</span>
        </div>
        {last ? <div className={cn("truncate rounded bg-muted/50 px-2 py-1 text-[11px]", last.level === "signal" && "text-success")}>{last.message}</div> : null}
        <div className="mt-1 flex flex-wrap gap-1">
          <Button size="sm" variant="secondary" onClick={onRun} loading={busy === `run:${agent.id}`}>
            <Play className="h-3.5 w-3.5" /> Executar agora
          </Button>
          {agent.status === "ACTIVE" ? (
            <Button size="sm" variant="outline" onClick={() => onStatus("PAUSED")} loading={busy === `status:${agent.id}`}>
              <Pause className="h-3.5 w-3.5" /> Pausar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onStatus("ACTIVE")} loading={busy === `status:${agent.id}`}>
              <Play className="h-3.5 w-3.5" /> Retomar
            </Button>
          )}
          {agent.status !== "STOPPED" ? (
            <Button size="sm" variant="outline" onClick={() => onStatus("STOPPED")}>
              <Square className="h-3.5 w-3.5" /> Parar
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete} loading={busy === `delete:${agent.id}`} aria-label="Excluir">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StrategiesLibrary({ strategies, onUse }: { strategies: StrategyInfo[]; onUse?: (key: string) => void }) {
  const cats: StrategyInfo["category"][] = ["technical", "sentiment", "cycles", "hybrid"];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estratégias Pré-Definidas de IA</CardTitle>
        <CardDescription>Regras determinísticas e auditáveis, agrupadas por categoria. Cada sinal registra o motivo no log.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {cats.map((c) => (
          <div key={c}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABEL[c]}</div>
            <ul className="flex flex-col gap-1">
              {strategies
                .filter((s) => s.category === c)
                .map((s) => (
                  <li key={s.key} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
                    <span>
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">{s.description}</span>
                    </span>
                    {onUse ? (
                      <Button size="sm" variant="ghost" onClick={() => onUse(s.key)} aria-label={`Usar ${s.name}`}>
                        <Bot className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface DefinitionsPayload {
  agents: Array<{ name: string; purpose: string; inputs: string[]; outputs: string[]; allowedTools: string[]; rules: string[]; timeoutMs: number; hasFallback: boolean }>;
  llm: { configured: boolean; provider: string; model: string };
}

function SystemAgents() {
  const { data } = useSWR<DefinitionsPayload>("/api/agents/definitions");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Arquitetura multiagente (sistema)</CardTitle>
        <CardDescription>
          market → scanner → technical-analysis → trend → risk → sentiment → orchestrator. Indicadores são calculados por código; LLM{" "}
          {data?.llm.configured ? `ativo (${data.llm.provider} · ${data.llm.model})` : "não configurado — modo determinístico"}.{" "}
          <Link href="/graficos" className="inline-flex items-center gap-1 text-primary hover:underline">
            Executar em um ativo <ExternalLink className="h-3 w-3" />
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(data?.agents ?? []).map((a) => (
          <div key={a.name} className="rounded-md border border-border p-3 text-xs">
            <div className="font-semibold text-sm">{a.name}</div>
            <p className="mt-1 text-muted-foreground">{a.purpose}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {a.allowedTools.map((t) => (
                <Badge key={t} variant="accent">
                  {t}
                </Badge>
              ))}
              <Badge variant="muted">timeout {a.timeoutMs / 1000}s</Badge>
              {a.hasFallback ? <Badge variant="warning">fallback</Badge> : null}
            </div>
            <ul className="mt-2 list-disc pl-4 text-muted-foreground">
              {a.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TelegramCard({ connected, planAllows, onChanged }: { connected: boolean; planAllows: boolean; onChanged: () => void }) {
  const { data: info } = useSWR<{ configured: boolean; botUsername: string | null }>("/api/telegram/test");
  const { toast } = useToast();
  const [chatId, setChatId] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "test" | null>(null);
  const save = async () => {
    setBusy("save");
    try {
      await postJson("/api/preferences", { telegramChatId: chatId }, "PATCH");
      toast({ title: "Chat ID salvo", variant: "success" });
      onChanged();
    } catch (err) {
      toast({ title: "Falha ao salvar", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      await postJson("/api/telegram/test", {});
      toast({ title: "Mensagem de teste enviada", variant: "success" });
    } catch (err) {
      toast({ title: "Telegram falhou", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">🔔 Alertas no Telegram {connected ? <Badge variant="success">conectado</Badge> : <Badge variant="muted">não conectado</Badge>}</CardTitle>
        <CardDescription>Receba sinais de compra/venda diretamente no Telegram, sem precisar abrir o site.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!planAllows ? <Alert variant="info">Alertas no Telegram estão disponíveis nos planos PRO e PLATINUM.</Alert> : null}
        {info && !info.configured ? (
          <Alert variant="warning">
            O servidor não tem <code>TELEGRAM_BOT_TOKEN</code> configurado; o envio ficará indisponível até o administrador ativar o bot.
          </Alert>
        ) : null}
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            {info?.botUsername ? (
              <>
                Abra{" "}
                <a className="text-primary hover:underline" href={`https://t.me/${info.botUsername}`} target="_blank" rel="noopener noreferrer">
                  @{info.botUsername}
                </a>{" "}
                e toque em <strong>Iniciar</strong>.
              </>
            ) : (
              <>
                Abra o bot do servidor no Telegram e toque em <strong>Iniciar</strong>.
              </>
            )}
          </li>
          <li>
            Descubra seu Chat ID com{" "}
            <a className="text-primary hover:underline" href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer">
              @userinfobot
            </a>{" "}
            e cole abaixo.
          </li>
          <li>Envie uma mensagem de teste para confirmar.</li>
        </ol>
        <div className="flex flex-col gap-1">
          <Label>Chat ID</Label>
          <div className="flex gap-2">
            <Input value={chatId} onChange={(e) => setChatId(e.target.value.replace(/[^\d-]/g, ""))} placeholder="123456789" inputMode="numeric" />
            <Button variant="secondary" onClick={() => void save()} loading={busy === "save"} disabled={!chatId}>
              Salvar
            </Button>
          </div>
        </div>
        <Button variant="outline" onClick={() => void test()} loading={busy === "test"} disabled={!connected || !info?.configured}>
          <Send className="h-4 w-4" /> Enviar mensagem de teste
        </Button>
      </CardContent>
    </Card>
  );
}
