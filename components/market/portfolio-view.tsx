"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Bell, Plus, Trash2 } from "lucide-react";
import type { ChartImageAnalysis } from "@/services/chart-image-service";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AnalysisResult } from "@/components/scanner/chart-analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, EmptyState, Skeleton, Stat } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/components/providers/toast-provider";
import { ASSETS } from "@/lib/assets";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";
import { PATTERN_LIST } from "@/lib/patterns/catalog";
import { formatDateTime, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface WatchItem {
  id: string;
  symbol: string;
  name: string;
  note: string | null;
  quantity: number | null;
  avgPrice: number | null;
  price: number | null;
  changePct24h: number | null;
  value: number | null;
  cost: number | null;
  pnl: number | null;
  pnlPct: number | null;
}
interface WatchPayload {
  items: WatchItem[];
  source: string;
  stale: boolean;
}
interface AlertDto {
  id: string;
  kind: string;
  timeframe: string;
  threshold: number | null;
  pattern: string | null;
  channel: string;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
  asset: { symbol: string; name: string };
}
interface SavedAnalysis {
  id: string;
  symbol: string | null;
  timeframe: string | null;
  provider: string;
  model: string;
  result: ChartImageAnalysis;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  price_above: "Preço acima de",
  price_below: "Preço abaixo de",
  rsi_above: "RSI acima de",
  rsi_below: "RSI abaixo de",
  pattern: "Padrão",
  volume: "Volume anômalo",
};

export function PortfolioView() {
  const { user, loading } = useSession();
  const params = useSearchParams();
  const [tab, setTab] = React.useState(params.get("tab") ?? "carteira");
  if (loading)
    return (
      <PageShell>
        <Skeleton className="h-40" />
      </PageShell>
    );
  if (!user) {
    return (
      <PageShell>
        <PageTitle icon="💼" title="Carteira" description="Watchlist com posições simuladas, alertas personalizados e análises salvas." />
        <Alert
          variant="info"
          title="Faça login para usar a Carteira"
          action={
            <Link href="/login?next=/carteira" className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
              Entrar
            </Link>
          }
        >
          Favoritos do scanner ficam neste navegador; a carteira, os alertas e as análises salvas ficam na sua conta.
        </Alert>
      </PageShell>
    );
  }
  return (
    <PageShell>
      <PageTitle icon="💼" title="Carteira" description="Watchlist com posições simuladas (quantidade e preço médio), alertas personalizados e análises de gráfico salvas." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="carteira">💼 Watchlist & posições</TabsTrigger>
          <TabsTrigger value="alertas">🔔 Alertas</TabsTrigger>
          <TabsTrigger value="analises">🧠 Análises salvas</TabsTrigger>
        </TabsList>
        <TabsContent value="carteira">
          <WatchlistPanel />
        </TabsContent>
        <TabsContent value="alertas">
          <AlertsPanel telegramAllowed={user.plan !== "FREE"} />
        </TabsContent>
        <TabsContent value="analises">
          <SavedAnalyses />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function WatchlistPanel() {
  const { data, error, isLoading, mutate } = useSWR<WatchPayload>("/api/watchlist", { refreshInterval: 15_000 });
  const [currency] = useLocalStorage<"USD" | "BRL">("cs-currency", "USD");
  const { data: fx } = useSWR<{ rate: number }>("/api/market/fx");
  const rate = fx?.rate ?? 1;
  const { toast } = useToast();
  const [symbol, setSymbol] = React.useState("BTC");
  const [qty, setQty] = React.useState("");
  const [avg, setAvg] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await postJson("/api/watchlist", { symbol, quantity: qty ? Number(qty) : undefined, avgPrice: avg ? Number(avg) : undefined });
      setQty("");
      setAvg("");
      await mutate();
    } catch (err) {
      toast({ title: "Falha ao adicionar", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (s: string) => {
    await apiFetch(`/api/watchlist/${s}`, { method: "DELETE" });
    await mutate();
  };
  const items = data?.items ?? [];
  const totalValue = items.reduce((s, i) => s + (i.value ?? 0), 0);
  const totalCost = items.reduce((s, i) => s + (i.cost ?? 0), 0);
  const totalPnl = totalValue - totalCost;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Valor das posições" value={formatPrice(totalValue, currency, rate)} />
        <Stat label="Custo" value={formatPrice(totalCost, currency, rate)} />
        <Stat label="P&L" value={formatPrice(totalPnl, currency, rate)} tone={totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "muted"} sub={totalCost ? formatPct((totalPnl / totalCost) * 100) : "—"} />
        <Stat label="Ativos" value={items.length} sub={data ? `fonte ${data.source}${data.stale ? " (defasado)" : ""}` : ""} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Adicionar ativo / posição simulada</CardTitle>
          <CardDescription>Quantidade e preço médio são opcionais — sem eles o ativo entra só como favorito.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-[200px_1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1">
            <Label>Ativo</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.glyph} {a.symbol} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Quantidade</Label>
            <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.5" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Preço médio (USD)</Label>
            <Input inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="65000" />
          </div>
          <Button onClick={() => void add()} loading={busy}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </CardContent>
      </Card>
      {error ? <Alert variant="danger">{error instanceof ApiClientError ? error.message : String(error)}</Alert> : null}
      {isLoading && !data ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState icon="💼" title="Sua watchlist está vazia" description="Adicione ativos para acompanhar preço, variação e P&L simulado." />
      ) : (
        <Card>
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">24h</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/graficos?symbol=${i.symbol}`} className="font-semibold hover:underline">
                        {i.symbol}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">{i.name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatPrice(i.price, currency, rate)}</TableCell>
                    <TableCell className={cn("text-right tabular", (i.changePct24h ?? 0) > 0 && "text-success", (i.changePct24h ?? 0) < 0 && "text-danger")}>{formatPct(i.changePct24h)}</TableCell>
                    <TableCell className="text-right tabular">{i.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{i.avgPrice ? formatPrice(i.avgPrice, currency, rate) : "—"}</TableCell>
                    <TableCell className="text-right tabular">{i.value !== null ? formatPrice(i.value, currency, rate) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular", (i.pnl ?? 0) > 0 && "text-success", (i.pnl ?? 0) < 0 && "text-danger")}>
                      {i.pnl !== null ? `${formatPrice(i.pnl, currency, rate)} (${formatPct(i.pnlPct)})` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => void remove(i.symbol)} aria-label="Remover">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AlertsPanel({ telegramAllowed }: { telegramAllowed: boolean }) {
  const { data, isLoading, mutate } = useSWR<{ items: AlertDto[] }>("/api/alerts", { refreshInterval: 30_000 });
  const { toast } = useToast();
  const [form, setForm] = React.useState({ symbol: "BTC", kind: "price_above", timeframe: "4h", threshold: "", pattern: "double_bottom", channel: "log" });
  const [busy, setBusy] = React.useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await postJson("/api/alerts", { ...form, threshold: form.threshold ? Number(form.threshold) : undefined, pattern: form.kind === "pattern" ? form.pattern : undefined });
      await mutate();
      toast({ title: "Alerta criado", variant: "success" });
    } catch (err) {
      toast({ title: "Falha ao criar alerta", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const needsThreshold = form.kind.startsWith("price") || form.kind.startsWith("rsi") || form.kind === "volume";
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Novo alerta
          </CardTitle>
          <CardDescription>Avaliado pelo worker a cada ciclo (5 min). Ao disparar, é desativado e registrado no histórico do scanner.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-6 md:items-end">
          <Field label="Ativo">
            <Select value={form.symbol} onValueChange={(v) => setForm({ ...form, symbol: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map((a) => (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    {a.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Timeframe">
            <Select value={form.timeframe} onValueChange={(v) => setForm({ ...form, timeframe: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["30m", "1h", "4h", "1d", "1w"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.kind === "pattern" ? (
            <Field label="Padrão">
              <Select value={form.pattern} onValueChange={(v) => setForm({ ...form, pattern: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PATTERN_LIST.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label={form.kind === "volume" ? "Aumento mín. (%)" : "Valor"}>
              <Input
                inputMode="decimal"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder={form.kind.startsWith("rsi") ? "70" : form.kind === "volume" ? "100" : "90000"}
              />
            </Field>
          )}
          <Field label="Canal">
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="log">📋 Painel</SelectItem>
                <SelectItem value="telegram" disabled={!telegramAllowed}>
                  ✈️ Telegram
                </SelectItem>
                <SelectItem value="both" disabled={!telegramAllowed}>
                  🔔 Ambos
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button onClick={() => void create()} loading={busy} disabled={needsThreshold && form.kind !== "volume" && !form.threshold}>
            <Plus className="h-4 w-4" /> Criar
          </Button>
        </CardContent>
      </Card>
      {isLoading && !data ? (
        <Skeleton className="h-32" />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState icon="🔔" title="Nenhum alerta" description="Crie alertas de preço, RSI, padrão ou volume para os ativos monitorados." />
      ) : (
        <Card>
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>TF</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold">{a.asset.symbol}</TableCell>
                    <TableCell>
                      {KIND_LABEL[a.kind]} {a.kind === "pattern" ? (PATTERN_LIST.find((p) => p.key === a.pattern)?.label ?? "qualquer") : (a.threshold ?? "")}
                      {a.kind === "volume" ? "%" : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{a.timeframe.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{{ log: "📋 Painel", telegram: "✈️ Telegram", both: "🔔 Ambos" }[a.channel]}</TableCell>
                    <TableCell>{a.active ? <Badge variant="success">ativo</Badge> : <Badge variant="warning">disparado {a.triggeredAt ? formatDateTime(a.triggeredAt) : ""}</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {!a.active ? (
                        <Button size="sm" variant="ghost" onClick={() => void postJson(`/api/alerts/${a.id}`, { active: true }, "PATCH").then(() => mutate())}>
                          Reativar
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => void apiFetch(`/api/alerts/${a.id}`, { method: "DELETE" }).then(() => mutate())} aria-label="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SavedAnalyses() {
  const { data, isLoading } = useSWR<{ items: SavedAnalysis[] }>("/api/analysis/saved");
  if (isLoading && !data) return <Skeleton className="h-32" />;
  if (!data || data.items.length === 0)
    return (
      <EmptyState
        icon="🧠"
        title="Nenhuma análise salva"
        description="As análises de gráfico por IA feitas no Scanner ficam registradas aqui."
        action={
          <Link href="/scanner/padroes#analise-ia" className="text-sm text-primary hover:underline">
            Ir para o Scanner
          </Link>
        }
      />
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.items.map((a) => (
        <div key={a.id}>
          <div className="mb-1 text-xs text-muted-foreground">
            {formatDateTime(a.createdAt)} · {a.provider} · {a.model}
          </div>
          <AnalysisResult result={{ ...a.result, id: a.id }} />
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
