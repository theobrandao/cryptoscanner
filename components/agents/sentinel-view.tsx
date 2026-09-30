"use client";

import * as React from "react";
import {
  ChartLine,
  Check,
  ClipboardList,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Satellite,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";
import { ASSETS, GLYPH_FONT_CLASS } from "@/lib/assets";
import { formatDateTime, formatPrice, timeAgo } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";
import type { TradePlan } from "@/agents/strategies";

interface SentinelItem {
  id: string;
  name: string;
  symbols: string[];
  timeframe: "4h" | "1d" | "1w";
  minConfidence: number;
  notification: "log" | "telegram" | "both";
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  lastRunAt: string | null;
  lastAlertAt: string | null;
  createdAt: string;
  _count: { logs: number };
  logs: Array<{
    id: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
}

interface Report {
  id: string;
  level: string;
  symbol: string | null;
  message: string;
  createdAt: string;
  data: null | {
    strategy?: string;
    side?: "buy" | "sell";
    confidence?: number;
    reason?: string;
    plan?: TradePlan;
    confluence?: { agree: string[]; disagree: string[] };
    pattern?: {
      key: string;
      label: string;
      confidence: number;
      direction: string;
    };
    context?: string[];
  };
}

const NOTIF_LABEL = {
  log: "Somente log",
  telegram: "Somente Telegram",
  both: "Log + Telegram",
} as const;

/**
 * Sentinela: um vigia por moeda que roda no servidor (ciclo de 5 min) avaliando os 17 padrões
 * ao mesmo tempo e emitindo relatórios com plano de trade e confluência. Implementação própria
 * sobre a infraestrutura de agentes (kind = "sentinel", slots separados).
 */
export function SentinelView() {
  const { user, loading: sessionLoading, telegramConnected } = useSession();
  const plan = PLANS[user?.plan ?? "FREE"];
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<{
    items: SentinelItem[];
    limit: number;
  }>(user ? "/api/sentinels" : null, { refreshInterval: 60_000 });
  const [selected, setSelected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const items = data?.items ?? [];
  const activeCount = items.filter((s) => s.status !== "STOPPED").length;
  const limit = data?.limit ?? plan.maxSentinels;
  const current = selected ? items.find((s) => s.id === selected) : items[0];

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await mutate();
    } catch (err) {
      toast({
        title: "Ação falhou",
        description: err instanceof ApiClientError ? err.message : String(err),
        variant: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  if (!sessionLoading && !user) {
    return (
      <PageShell>
        <PageTitle
          icon={<Satellite className="h-5 w-5" />}
          title="Agente Sentinela"
          description="Escolha uma moeda e o Sentinela vigia todos os padrões gráficos ao mesmo tempo, 24/7, no servidor."
        />
        <EmptyState
          icon={<Lock className="h-8 w-8 text-muted-foreground" aria-hidden />}
          title="Faça login para criar um Sentinela"
          description="Cada plano tem slots de Sentinela separados dos agentes comuns (Free: 1 · Pro: 3 · Elite: 10)."
          action={
            <Link
              href="/login?next=/sentinela"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Entrar
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageTitle
        icon={<Satellite className="h-5 w-5" />}
        title="Agente Sentinela"
        description="Um Sentinela por moeda: a cada 5 minutos (24/7, no servidor) ele avalia os 17 padrões gráficos, calcula plano de trade (entrada, alvo, stop, risco/retorno) e a confluência com EMAs, RSI, StochRSI, MACD e tendência superior, e grava um relatório quando a confiança mínima é atingida. Não consome seus agentes comuns."
      />
      {error ? (
        <Alert variant="danger">
          Não foi possível carregar seus Sentinelas.
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-4">
          <NewSentinelCard
            planName={plan.name}
            activeCount={activeCount}
            limit={limit}
            telegramAllowed={plan.telegramAlerts}
            telegramConnected={telegramConnected}
            onCreated={(id) => {
              void mutate();
              setSelected(id);
              toast({
                title: "Sentinela criado",
                description: "Primeira varredura em até 5 minutos.",
                variant: "success",
              });
            }}
          />
          <Card>
            <CardHeader>
              <CardTitle>Meus Sentinelas</CardTitle>
              <CardDescription>
                {activeCount} de {limit} slot(s) do plano {plan.name} em uso.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {isLoading && !data ? <Skeleton className="h-16" /> : null}
              {data && items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum Sentinela ainda. Crie o primeiro ao lado.
                </p>
              ) : null}
              {items.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    current?.id === s.id ? "border-primary" : "border-border",
                  )}
                >
                  <button
                    className="flex w-full items-center justify-between text-left cursor-pointer"
                    onClick={() => setSelected(s.id)}
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Satellite className="h-4 w-4 text-primary" aria-hidden />{" "}
                      {s.name}
                    </span>
                    <Badge
                      variant={
                        s.status === "ACTIVE"
                          ? "success"
                          : s.status === "PAUSED"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {s.status === "ACTIVE"
                        ? "ativo"
                        : s.status === "PAUSED"
                          ? "pausado"
                          : "parado"}
                    </Badge>
                  </button>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.symbols[0]}/USDT · {TIMEFRAME_LABEL[s.timeframe]} ·
                    confiança mín. {s.minConfidence}% ·{" "}
                    {NOTIF_LABEL[s.notification]}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Última varredura: {s.lastRunAt ? timeAgo(s.lastRunAt) : "—"}{" "}
                    · {s._count.logs} registro(s) (últimos 7 dias)
                  </div>
                  <div className="mt-2 flex gap-2">
                    {s.status === "ACTIVE" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy === `pause-${s.id}`}
                        onClick={() =>
                          void act(`pause-${s.id}`, () =>
                            apiFetch(`/api/sentinels/${s.id}`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ status: "PAUSED" }),
                            }),
                          )
                        }
                      >
                        <Pause className="h-4 w-4" aria-hidden /> Pausar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy === `resume-${s.id}`}
                        onClick={() =>
                          void act(`resume-${s.id}`, () =>
                            apiFetch(`/api/sentinels/${s.id}`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ status: "ACTIVE" }),
                            }),
                          )
                        }
                      >
                        <Play className="h-4 w-4" aria-hidden /> Reativar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === `run-${s.id}`}
                      onClick={() =>
                        void act(`run-${s.id}`, () =>
                          postJson(`/api/agents/${s.id}/run`, {}),
                        )
                      }
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden /> Varrer agora
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      aria-label={`Excluir ${s.name}`}
                      loading={busy === `del-${s.id}`}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Excluir o ${s.name}? Os relatórios serão apagados.`,
                          )
                        )
                          return;
                        void act(`del-${s.id}`, () =>
                          apiFetch(`/api/sentinels/${s.id}`, {
                            method: "DELETE",
                          }),
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {current ? (
            <Reports sentinel={current} />
          ) : (
            <EmptyState
              icon={
                <ClipboardList
                  className="h-8 w-8 text-muted-foreground"
                  aria-hidden
                />
              }
              title="Relatórios de sinal"
              description="Selecione um Sentinela para ver os relatórios (atualizados a cada 60 s; retenção de 30 dias)."
            />
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <TriangleAlert
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden
            />{" "}
            Os relatórios são sinais técnicos gerados por regras determinísticas
            sobre dados públicos de mercado. A confiança mede a qualidade
            geométrica do padrão e a confluência de indicadores — não a
            probabilidade de lucro. Nada aqui é recomendação de investimento.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

function NewSentinelCard({
  planName,
  activeCount,
  limit,
  telegramAllowed,
  telegramConnected,
  onCreated,
}: {
  planName: string;
  activeCount: number;
  limit: number;
  telegramAllowed: boolean;
  telegramConnected: boolean;
  onCreated: (id: string) => void;
}) {
  const [symbol, setSymbol] = React.useState("BTC");
  const [timeframe, setTimeframe] = React.useState<"4h" | "1d" | "1w">("4h");
  const [minConfidence, setMinConfidence] = React.useState(70);
  const [notification, setNotification] = React.useState<
    "log" | "telegram" | "both"
  >("log");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const full = activeCount >= limit;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await postJson<{ sentinel: { id: string } }>(
        "/api/sentinels",
        { symbol, timeframe, minConfidence, notification },
      );
      onCreated(res.sentinel.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Falha ao criar.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-primary" aria-hidden /> Novo
          Sentinela
        </CardTitle>
        <CardDescription>
          Um por moeda. Roda no servidor — não precisa deixar a página aberta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Moeda monitorada (21 do scanner)</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger aria-label="Moeda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    <span className={GLYPH_FONT_CLASS}>{a.glyph}</span> {a.symbol} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Tempo gráfico principal</Label>
            <Select
              value={timeframe}
              onValueChange={(v) => setTimeframe(v as "4h" | "1d" | "1w")}
            >
              <SelectTrigger aria-label="Timeframe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4h">4 horas (recomendado)</SelectItem>
                <SelectItem value="1d">Diário</SelectItem>
                <SelectItem value="1w">Semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>
              Confiança mínima para alertar:{" "}
              <span className="font-semibold text-foreground">
                {minConfidence}%
              </span>
            </Label>
            <Slider
              min={50}
              max={95}
              step={5}
              value={[minConfidence]}
              onValueChange={(v) => setMinConfidence(v[0] ?? 70)}
              aria-label="Confiança mínima"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Notificações</Label>
            <Select
              value={notification}
              onValueChange={(v) =>
                setNotification(v as "log" | "telegram" | "both")
              }
            >
              <SelectTrigger aria-label="Notificações">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="log">Somente log da plataforma</SelectItem>
                <SelectItem value="both" disabled={!telegramAllowed}>
                  Log + Telegram {telegramAllowed ? "" : "(PRO/ELITE)"}
                </SelectItem>
                <SelectItem value="telegram" disabled={!telegramAllowed}>
                  Somente Telegram {telegramAllowed ? "" : "(PRO/ELITE)"}
                </SelectItem>
              </SelectContent>
            </Select>
            {notification !== "log" && !telegramConnected ? (
              <p className="text-xs text-warning">
                Conecte o Telegram em{" "}
                <Link href="/preferencias" className="underline">
                  Preferências
                </Link>{" "}
                para receber no Telegram.
              </p>
            ) : null}
          </div>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {full ? (
            <Alert variant="warning">
              Limite de Sentinelas atingido: {activeCount} de {limit} no plano{" "}
              {planName}.
            </Alert>
          ) : null}
          <Button type="submit" loading={loading} disabled={full}>
            Criar Sentinela
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Reports({ sentinel }: { sentinel: SentinelItem }) {
  const { data, isLoading } = useSWR<{ items: Report[] }>(
    `/api/sentinels/${sentinel.id}/reports?limit=50`,
    { refreshInterval: 60_000 },
  );
  const signals = (data?.items ?? []).filter(
    (r) =>
      r.level === "signal" ||
      r.level === "info" ||
      r.level === "warn" ||
      r.level === "error",
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden />{" "}
          Relatórios — {sentinel.name}
        </CardTitle>
        <CardDescription>
          Atualizado automaticamente a cada 60 segundos. Retenção de 30 dias.
          Sinais abaixo da confiança mínima ({sentinel.minConfidence}%) aparecem
          como “info”.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && !data ? <Skeleton className="h-24" /> : null}
        {data && signals.length === 0 ? (
          <EmptyState
            icon={
              <Satellite
                className="h-8 w-8 text-muted-foreground"
                aria-hidden
              />
            }
            title="Nenhum relatório ainda"
            description={`Assim que o Sentinela detectar um padrão com confiança ≥ ${sentinel.minConfidence}% em ${sentinel.symbols[0]} ${TIMEFRAME_LABEL[sentinel.timeframe]}, o relatório completo aparece aqui (varredura a cada 5 minutos). Use “Varrer agora” para uma verificação imediata.`}
          />
        ) : null}
        {signals.map((r) => {
          const d = r.data;
          const buy = d?.side === "buy";
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-md border p-3 text-sm",
                r.level === "signal"
                  ? buy
                    ? "border-success/50"
                    : "border-danger/50"
                  : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      r.level === "signal"
                        ? buy
                          ? "success"
                          : "danger"
                        : r.level === "warn"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {r.level === "signal"
                      ? buy
                        ? "▲ COMPRA"
                        : "▼ VENDA"
                      : r.level.toUpperCase()}
                  </Badge>
                  {d?.pattern ? (
                    <span className="font-semibold">
                      {d.pattern.label} · {d.pattern.confidence}%
                    </span>
                  ) : null}
                  {d?.confidence !== undefined ? (
                    <span className="text-xs text-muted-foreground">
                      confiança final {d.confidence}%
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                </span>
              </div>
              {!d?.pattern ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.message}
                </p>
              ) : null}
              {d?.plan ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                  <dt className="text-muted-foreground">Entrada</dt>
                  <dd className="tabular">{formatPrice(d.plan.entry)}</dd>
                  <dt className="text-muted-foreground">Alvo</dt>
                  <dd className="tabular text-success">
                    {d.plan.target
                      ? `${formatPrice(d.plan.target)} (${d.plan.potentialPct?.toFixed(2)}%)`
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Stop</dt>
                  <dd className="tabular text-danger">
                    {d.plan.stop
                      ? `${formatPrice(d.plan.stop)} (−${d.plan.riskPct?.toFixed(2)}%)`
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Risco/retorno</dt>
                  <dd className="tabular">
                    {d.plan.riskReward !== null &&
                    d.plan.riskReward !== undefined
                      ? `1 : ${d.plan.riskReward.toFixed(2)}`
                      : "—"}
                  </dd>
                </dl>
              ) : null}
              {d?.confluence ? (
                <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                  {d.confluence.agree.map((a) => (
                    <span
                      key={`a-${a}`}
                      className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-success"
                    >
                      <Check className="h-3 w-3" aria-hidden /> {a}
                    </span>
                  ))}
                  {d.confluence.disagree.map((a) => (
                    <span
                      key={`d-${a}`}
                      className="inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-danger"
                    >
                      <X className="h-3 w-3" aria-hidden /> {a}
                    </span>
                  ))}
                </div>
              ) : null}
              {d?.reason ? (
                <p className="mt-2 text-xs text-muted-foreground">{d.reason}</p>
              ) : null}
              {d?.context?.length ? (
                <ul className="mt-1 text-[11px] text-warning">
                  {d.context.map((c) => (
                    <li key={c} className="flex items-start gap-1">
                      <TriangleAlert
                        className="mt-0.5 h-3 w-3 shrink-0"
                        aria-hidden
                      />{" "}
                      {c}
                    </li>
                  ))}
                </ul>
              ) : null}
              {d?.pattern ? (
                <div className="mt-2 text-xs">
                  <Link
                    href={`/graficos?symbol=${sentinel.symbols[0]}&timeframe=${sentinel.timeframe}&pattern=${d.pattern.key}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <ChartLine className="h-3.5 w-3.5" aria-hidden /> Ver no
                    gráfico
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
