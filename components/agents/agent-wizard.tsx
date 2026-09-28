"use client";

import * as React from "react";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { AgentBody } from "@/lib/validation/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Slider } from "@/components/ui/slider";
import { ASSETS } from "@/lib/assets";
import { ApiClientError, postJson } from "@/lib/client-api";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import type { PlanDefinition } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types/market";

export interface StrategyInfo {
  key: string;
  name: string;
  category: "technical" | "sentiment" | "cycles" | "hybrid";
  description: string;
  timeframes: Timeframe[];
}

export const CATEGORY_LABEL: Record<StrategyInfo["category"], string> = { technical: "📈 Análise Técnica", sentiment: "🧠 Sentimento", cycles: "🔄 Ciclos", hybrid: "⚡ Híbridas" };
const ICONS = ["🤖", "⚡", "🚀", "🐉", "🔥", "💎", "📉"];
const STEPS = ["Identidade", "Mercado & Timeframe", "Estratégias", "Configurações do Alerta", "Confirmar"];

export interface AgentDraft extends AgentBody {
  id?: string;
}

export const EMPTY_DRAFT: AgentDraft = {
  name: "",
  icon: "🤖",
  description: "",
  symbols: ["BTC"],
  operationType: "swing_trade",
  timeframe: "4h",
  strategies: [],
  minConfidence: 70,
  notification: "log",
};

/** Wizard de 5 passos observado na referência: Identidade → Mercado & Timeframe → Estratégias → Configurações do Alerta → Confirmar. */
export function AgentWizard({
  open,
  onOpenChange,
  initial,
  plan,
  telegramConnected,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: AgentDraft;
  plan: PlanDefinition;
  telegramConnected: boolean;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {/* O corpo é montado a cada abertura, então o estado parte sempre de `initial`. */}
        <WizardBody initial={initial} plan={plan} telegramConnected={telegramConnected} onSaved={onSaved} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function WizardBody({
  initial,
  plan,
  telegramConnected,
  onSaved,
  onOpenChange,
}: {
  initial: AgentDraft;
  plan: PlanDefinition;
  telegramConnected: boolean;
  onSaved: () => void;
  onOpenChange: (o: boolean) => void;
}) {
  const [step, setStep] = React.useState(0);
  const [draft, setDraft] = React.useState<AgentDraft>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { data: strategies } = useSWR<{ strategies: StrategyInfo[] }>("/api/agents/strategies");

  const update = (patch: Partial<AgentDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const canNext = () => {
    if (step === 0) return draft.name.trim().length >= 2;
    if (step === 1) return draft.symbols.length > 0;
    if (step === 2) return draft.strategies.length > 0;
    return true;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: AgentBody = { ...draft, description: draft.description || null };
      if (draft.id) await postJson(`/api/agents/${draft.id}`, body, "PATCH");
      else await postJson("/api/agents", body);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Falha ao salvar o agente.");
    } finally {
      setSaving(false);
    }
  };

  const allowedTfs: Timeframe[] = (["15m", "30m", "1h", "4h", "1d", "1w"] as Timeframe[]).filter((tf) => plan.timeframes.includes(tf));
  const grouped = React.useMemo(() => {
    const g = new Map<StrategyInfo["category"], StrategyInfo[]>();
    for (const s of strategies?.strategies ?? []) g.set(s.category, [...(g.get(s.category) ?? []), s]);
    return g;
  }, [strategies]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{draft.id ? "Editar agente" : "Novo Agente de IA"}</DialogTitle>
        <DialogDescription>
          Passo {step + 1} de {STEPS.length} — {STEPS[step]}
        </DialogDescription>
      </DialogHeader>
      <ol className="flex flex-wrap gap-1 text-[11px]">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "rounded-full border px-2 py-0.5",
              i === step ? "border-primary bg-primary/15 text-primary" : i < step ? "border-success/40 text-success" : "border-border text-muted-foreground",
            )}
          >
            {i < step ? "✓ " : `${i + 1}. `}
            {s}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-3">
          <div className="flex flex-col gap-1">
            <Label>Nome do agente</Label>
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Ex.: Sentinela BTC 4H" maxLength={60} autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Ícone</Label>
            <div className="flex gap-1">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => update({ icon: ic })}
                  className={cn("grid h-9 w-9 place-items-center rounded-md border text-lg cursor-pointer", draft.icon === ic ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}
                  aria-pressed={draft.icon === ic}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Descrição (opcional)</Label>
            <Textarea value={draft.description ?? ""} onChange={(e) => update({ description: e.target.value })} placeholder="O que este agente vigia?" maxLength={300} />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-3">
          <div className="flex flex-col gap-1">
            <Label>Ativos ({draft.symbols.length} selecionados)</Label>
            <div className="grid max-h-44 grid-cols-3 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-4">
              {ASSETS.map((a) => {
                const on = draft.symbols.includes(a.symbol);
                return (
                  <label key={a.symbol} className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm", on ? "bg-primary/15" : "hover:bg-muted")}>
                    <Checkbox checked={on} onCheckedChange={(v) => update({ symbols: v ? [...draft.symbols, a.symbol] : draft.symbols.filter((s) => s !== a.symbol) })} />
                    <span className="text-muted-foreground">{a.glyph}</span> {a.symbol}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Tipo de operação</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["day_trade", "⚡ Day Trade", "Entradas e saídas intradiárias; timeframes 15M–1H."],
                  ["swing_trade", "🌊 Swing Trade", "Posições de dias a semanas; timeframes 4H–1W."],
                ] as const
              ).map(([k, label, desc]) => (
                <button
                  key={k}
                  onClick={() => update({ operationType: k, timeframe: k === "day_trade" ? (allowedTfs.includes("1h") ? "1h" : "4h") : "4h" })}
                  className={cn("rounded-md border p-3 text-left cursor-pointer", draft.operationType === k ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}
                >
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Timeframe principal</Label>
            <div className="flex flex-wrap gap-1">
              {(["15m", "30m", "1h", "4h", "1d", "1w"] as Timeframe[]).map((tf) => {
                const locked = !allowedTfs.includes(tf);
                return (
                  <button
                    key={tf}
                    disabled={locked}
                    onClick={() => update({ timeframe: tf as AgentDraft["timeframe"] })}
                    className={cn(
                      "h-9 rounded-md border px-3 text-sm font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                      draft.timeframe === tf ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                    )}
                  >
                    {TIMEFRAME_LABEL[tf] === "7D" ? "1W" : TIMEFRAME_LABEL[tf]}
                    {locked ? " 🔒" : ""}
                  </button>
                );
              })}
            </div>
            {allowedTfs.length < 6 ? <p className="text-xs text-muted-foreground">Timeframes 15M, 30M e 1H exigem o plano PLATINUM.</p> : null}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">Selecione uma ou mais estratégias (regras determinísticas, auditáveis — o motivo de cada sinal aparece no log).</p>
          {[...grouped.entries()].map(([cat, list]) => (
            <div key={cat}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABEL[cat]}</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {list.map((s) => {
                  const on = draft.strategies.includes(s.key);
                  const fits = s.timeframes.length === 0 || s.timeframes.includes(draft.timeframe as Timeframe);
                  return (
                    <label
                      key={s.key}
                      className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm", on ? "border-primary bg-primary/10" : "border-border hover:bg-muted", !fits && "opacity-60")}
                    >
                      <Checkbox className="mt-0.5" checked={on} onCheckedChange={(v) => update({ strategies: v ? [...draft.strategies, s.key] : draft.strategies.filter((k) => k !== s.key) })} />
                      <span>
                        <span className="font-medium">{s.name}</span>
                        {!fits ? <span className="ml-1 text-[10px] text-warning">(indicada p/ {s.timeframes.map((t) => TIMEFRAME_LABEL[t]).join(", ")})</span> : null}
                        <span className="block text-xs text-muted-foreground">{s.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label>
              Confiança mínima: <span className="text-foreground">{draft.minConfidence}%</span>
            </Label>
            <Slider min={50} max={95} step={5} value={[draft.minConfidence]} onValueChange={([v]) => update({ minConfidence: v ?? 70 })} />
            <p className="text-xs text-muted-foreground">Só sinais com confiança igual ou superior geram alerta. Cooldown mínimo de 30 minutos entre alertas do mesmo agente.</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Tipo de notificação</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["log", "📋 Log", "Apenas no painel"],
                  ["telegram", "✈️ Telegram", "Mensagem no app"],
                  ["both", "🔔 Ambos", "Painel + Telegram"],
                ] as const
              ).map(([k, label, desc]) => {
                const locked = k !== "log" && !plan.telegramAlerts;
                return (
                  <button
                    key={k}
                    disabled={locked}
                    onClick={() => update({ notification: k })}
                    className={cn(
                      "rounded-md border p-3 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                      draft.notification === k ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                    )}
                  >
                    <div className="font-semibold">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {desc}
                      {locked ? " · PRO/PLATINUM" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            {draft.notification !== "log" && !telegramConnected ? <Alert variant="warning">Conecte o Telegram (Chat ID) na seção “Alertas no Telegram” para receber as mensagens.</Alert> : null}
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="grid gap-2 text-sm">
          <Row k="Agente" v={`${draft.icon} ${draft.name}`} />
          <Row k="Ativos" v={draft.symbols.join(", ")} />
          <Row k="Operação" v={draft.operationType === "day_trade" ? "⚡ Day Trade" : "🌊 Swing Trade"} />
          <Row k="Timeframe" v={TIMEFRAME_LABEL[draft.timeframe as Timeframe]} />
          <Row
            k="Estratégias"
            v={
              <span className="flex flex-wrap gap-1">
                {draft.strategies.map((k) => (
                  <Badge key={k} variant="outline">
                    {strategies?.strategies.find((s) => s.key === k)?.name ?? k}
                  </Badge>
                ))}
              </span>
            }
          />
          <Row k="Confiança mínima" v={`${draft.minConfidence}%`} />
          <Row k="Notificação" v={{ log: "📋 Log", telegram: "✈️ Telegram", both: "🔔 Ambos" }[draft.notification]} />
          <p className="text-xs text-muted-foreground">O agente é verificado pelo servidor a cada 5 minutos, independentemente do navegador estar aberto.</p>
        </div>
      ) : null}

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
            Próximo <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => void save()} loading={saving}>
            <Check className="h-4 w-4" /> {draft.id ? "Salvar alterações" : "Ativar agente"}
          </Button>
        )}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-border py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
