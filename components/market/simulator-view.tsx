"use client";

import * as React from "react";
import useSWR from "swr";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, EmptyState, Skeleton, Stat } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";
import { ASSETS } from "@/lib/assets";
import { formatDateTime, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SimulationInput, SimulationResult } from "@/services/simulation-service";

const PROFILE_LABEL = { conservador: "🛡️ Conservador (40 % no ativo)", moderado: "⚡ Moderado (70 % no ativo)", arrojado: "🚀 Arrojado (100 % no ativo)" } as const;
const STRATEGY_LABEL = { dca: "DCA — aportes mensais", lump_sum: "Aporte único" } as const;

interface SavedSimulation {
  id: string;
  symbol: string;
  strategy: "dca" | "lump_sum";
  currency: "USD" | "BRL" | "EUR";
  initialCapital: number;
  monthlyContribution: number;
  months: number;
  riskProfile: SimulationInput["riskProfile"];
  totalInvested: number;
  finalValue: number;
  profitPct: number;
  maxDrawdownPct: number;
  createdAt: string;
}

function money(v: number, currency: "USD" | "BRL" | "EUR"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}

/** Gráfico SVG simples: valor da carteira vs. total investido. */
function EquityChart({ result }: { result: SimulationResult }) {
  const w = 720;
  const h = 220;
  const pad = 8;
  const pts = result.curve;
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => Math.max(p.value, p.invested)));
  const min = Math.min(...pts.map((p) => Math.min(p.value, p.invested)));
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = (key: "value" | "invested") => pts.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const up = result.profit >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full" role="img" aria-label="Evolução do valor da carteira e do total investido">
      <polyline points={line("invested")} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points={line("value")} fill="none" stroke={up ? "var(--success)" : "var(--danger)"} strokeWidth="2" />
    </svg>
  );
}

export function SimulatorView() {
  const { user } = useSession();
  const { toast } = useToast();
  const { data: saved, mutate } = useSWR<{ items: SavedSimulation[] }>(user ? "/api/simulations" : null);
  const [input, setInput] = React.useState<SimulationInput>({ symbol: "BTC", strategy: "dca", currency: "BRL", initialCapital: 1000, monthlyContribution: 500, months: 12, riskProfile: "moderado" });
  const [result, setResult] = React.useState<SimulationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await postJson<{ result: SimulationResult }>("/api/simulations/run", input);
      setResult(res.result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Falha ao simular.");
    } finally {
      setLoading(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await postJson("/api/simulations", input);
      await mutate();
      toast({ title: "Simulação salva", variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível salvar", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Excluir esta simulação?")) return;
    try {
      await apiFetch(`/api/simulations/${id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      toast({ title: "Falha ao excluir", description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });
    }
  };
  const load = (s: SavedSimulation) => {
    setInput({ symbol: s.symbol, strategy: s.strategy, currency: s.currency, initialCapital: s.initialCapital, monthlyContribution: s.monthlyContribution, months: s.months as SimulationInput["months"], riskProfile: s.riskProfile });
    setResult(null);
  };
  const cur = input.currency;

  return (
    <PageShell>
      <PageTitle
        icon="📜"
        title="Simulador de Aportes"
        description="Backtest com preços diários reais (Binance; câmbio diário USDTBRL para BRL e EURUSDT para EUR): DCA mensal ou aporte único, com perfil de risco que define a fração no ativo — o restante fica em reserva sem rendimento. Simulação histórica, não projeção."
      />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Parâmetros</CardTitle>
            <CardDescription>Períodos de 6 a 36 meses, terminando hoje.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void run(e)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>Ativo</Label>
                <Select value={input.symbol} onValueChange={(v) => setInput({ ...input, symbol: v })}>
                  <SelectTrigger aria-label="Ativo">
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
                <Label>Estratégia</Label>
                <Select value={input.strategy} onValueChange={(v) => setInput({ ...input, strategy: v as SimulationInput["strategy"] })}>
                  <SelectTrigger aria-label="Estratégia">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dca">{STRATEGY_LABEL.dca}</SelectItem>
                    <SelectItem value="lump_sum">{STRATEGY_LABEL.lump_sum}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Moeda</Label>
                <Select value={input.currency} onValueChange={(v) => setInput({ ...input, currency: v as "USD" | "BRL" | "EUR" })}>
                  <SelectTrigger aria-label="Moeda">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">🇧🇷 Real (BRL)</SelectItem>
                    <SelectItem value="USD">🇺🇸 Dólar (USD)</SelectItem>
                    <SelectItem value="EUR">🇪🇺 Euro (EUR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sim-cap">Capital inicial ({cur})</Label>
                  <Input id="sim-cap" type="number" min={0} step="any" value={input.initialCapital} onChange={(e) => setInput({ ...input, initialCapital: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sim-month">Aporte mensal ({cur})</Label>
                  <Input id="sim-month" type="number" min={0} step="any" value={input.monthlyContribution} onChange={(e) => setInput({ ...input, monthlyContribution: Number(e.target.value) })} disabled={input.strategy === "lump_sum"} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Período</Label>
                <div className="grid grid-cols-4 gap-1">
                  {([6, 12, 24, 36] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setInput({ ...input, months: m })} className={cn("rounded-md border px-2 py-1.5 text-xs font-semibold cursor-pointer", input.months === m ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                      {m === 6 ? "6 meses" : `${m / 12} ano${m > 12 ? "s" : ""}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Perfil de risco (metodologia própria)</Label>
                <Select value={input.riskProfile} onValueChange={(v) => setInput({ ...input, riskProfile: v as SimulationInput["riskProfile"] })}>
                  <SelectTrigger aria-label="Perfil de risco">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROFILE_LABEL) as Array<keyof typeof PROFILE_LABEL>).map((k) => (
                      <SelectItem key={k} value={k}>
                        {PROFILE_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <div className="flex gap-2">
                <Button type="submit" loading={loading}>
                  Simular
                </Button>
                {result && user ? (
                  <Button type="button" variant="outline" loading={saving} onClick={() => void save()}>
                    Salvar simulação
                  </Button>
                ) : null}
              </div>
              {!user ? <p className="text-xs text-muted-foreground">Faça login para salvar e comparar simulações.</p> : null}
            </form>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          {loading && !result ? <Skeleton className="h-64" /> : null}
          {!result && !loading ? <EmptyState icon="📜" title="Nenhuma simulação executada" description="Defina os parâmetros e clique em Simular. O cálculo usa os fechamentos diários reais do período." /> : null}
          {result ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Total investido" value={money(result.totalInvested, cur)} sub={`${result.contributions} aporte(s)`} />
                <Stat label="Valor final" value={money(result.finalValue, cur)} sub={`${formatDateTime(result.endDate)}`} tone={result.profit >= 0 ? "up" : "down"} />
                <Stat label="Resultado" value={`${money(result.profit, cur)} (${formatPct(result.profitPct)})`} sub={result.cagrPct !== null ? `${formatPct(result.cagrPct)} ao ano` : "—"} tone={result.profit >= 0 ? "up" : "down"} />
                <Stat label="Queda máxima" value={`−${result.maxDrawdownPct.toFixed(2)}%`} sub={`vs. HODL 100 %: ${formatPct(result.benchmarkHoldPct)}`} tone="down" />
              </div>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>
                      {result.input.symbol} · {STRATEGY_LABEL[result.input.strategy]} · {result.input.months} meses
                    </CardTitle>
                    <Badge variant="muted">{PROFILE_LABEL[result.input.riskProfile]}</Badge>
                  </div>
                  <CardDescription>
                    {formatDateTime(result.startDate)} → {formatDateTime(result.endDate)} · preço {money(result.firstPrice, cur)} → {money(result.lastPrice, cur)} · {result.unitsHeld} {result.input.symbol} acumulados
                    {result.averagePrice ? ` · preço médio ${money(result.averagePrice, cur)}` : ""}
                    {result.fx.applied ? ` · câmbio: ${result.fx.source}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EquityChart result={result} />
                  <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4" style={{ background: result.profit >= 0 ? "var(--success)" : "var(--danger)" }} /> valor da carteira
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 border-t border-dashed border-current opacity-50" /> total investido
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Mês a mês</CardTitle>
                  <CardDescription>
                    Melhor mês: {result.bestMonth ? `${result.bestMonth.month} (${formatPct(result.bestMonth.pct)})` : "—"} · pior mês: {result.worstMonth ? `${result.worstMonth.month} (${formatPct(result.worstMonth.pct)})` : "—"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-72 overflow-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">Aportado</TableHead>
                        <TableHead className="text-right">Valor no fim</TableHead>
                        <TableHead className="text-right">Variação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.monthly.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell>{m.month}</TableCell>
                          <TableCell className="text-right tabular">{money(m.invested, cur)}</TableCell>
                          <TableCell className="text-right tabular">{money(m.value, cur)}</TableCell>
                          <TableCell className={cn("text-right tabular", m.pct > 0 && "text-success", m.pct < 0 && "text-danger")}>{formatPct(m.pct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">⚠️ {result.disclaimer}</p>
            </>
          ) : null}
          {user ? (
            <Card>
              <CardHeader>
                <CardTitle>Minhas simulações</CardTitle>
                <CardDescription>Clique para recarregar os parâmetros.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {saved && saved.items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma simulação salva ainda.</p> : null}
                {saved && saved.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Ativo</TableHead>
                        <TableHead>Estratégia</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Aportes</TableHead>
                        <TableHead className="text-right">Valor final</TableHead>
                        <TableHead className="text-right">Lucro %</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saved.items.map((s) => (
                        <TableRow key={s.id} className="cursor-pointer" onClick={() => load(s)}>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                          <TableCell className="font-semibold">{s.symbol}</TableCell>
                          <TableCell>{STRATEGY_LABEL[s.strategy]}</TableCell>
                          <TableCell>{s.months} m</TableCell>
                          <TableCell className="text-right tabular">{money(s.totalInvested, s.currency)}</TableCell>
                          <TableCell className="text-right tabular">{money(s.finalValue, s.currency)}</TableCell>
                          <TableCell className={cn("text-right tabular", s.profitPct >= 0 ? "text-success" : "text-danger")}>{formatPct(s.profitPct)}</TableCell>
                          <TableCell className="text-right">
                            <button
                              className="text-xs text-danger hover:underline cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                void remove(s.id);
                              }}
                            >
                              excluir
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
