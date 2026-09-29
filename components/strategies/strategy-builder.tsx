"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, Copy, FlaskConical, Play, Plus, Radar, Save, Trash2, X } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { AccessGate } from "@/components/account/access-gate";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, postJson } from "@/lib/client-api";
import { ASSETS } from "@/lib/assets";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INSTRUMENT_LABEL, INSTRUMENTS, VENUE_LABEL, VENUES, type Instrument, type Venue } from "@/lib/venues";
import { describeCondition, featureSpec, type Condition, type FeatureSpec, type Op, type StrategyDefinition } from "@/lib/strategies/definition";
import type { LiveEvaluation, ScanRow, StrategyRecord } from "@/services/strategy-service";

interface Catalog {
  features: FeatureSpec[];
  ops: Op[];
  timeframes: string[];
}
interface Payload {
  items: StrategyRecord[];
  limit: number;
  catalog: Catalog;
  templates: Array<{ name: string; description: string; definition: StrategyDefinition }>;
}

const EMPTY: StrategyDefinition = {
  version: 1,
  direction: "long",
  logic: "AND",
  groups: [{ logic: "AND", conditions: [{ tf: "4h", feature: "trend", op: "==", value: "bullish" }] }],
  exit: { stop: "atr", atrMult: 1.5, rr: 2, horizon: 60 },
};

const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring";

function defaultValue(spec: FeatureSpec | undefined): Condition["value"] {
  if (!spec) return 0;
  if (spec.kind === "boolean") return true;
  if (spec.kind === "enum") return spec.options?.[0] ?? "";
  return spec.min != null && spec.max != null ? Math.round((spec.min + spec.max) / 2) : 0;
}

function ConditionRow({ c, catalog, onChange, onRemove }: { c: Condition; catalog: Catalog; onChange: (c: Condition) => void; onRemove: () => void }) {
  const spec = featureSpec(c.feature);
  const ops = spec?.kind === "number" ? catalog.ops : (["==", "!="] as Op[]);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background/40 p-1.5">
      <select aria-label="Timeframe" className={selectCls} value={c.tf} onChange={(e) => onChange({ ...c, tf: e.target.value as Condition["tf"] })}>
        {catalog.timeframes.map((t) => (
          <option key={t} value={t}>
            {t.toUpperCase()}
          </option>
        ))}
      </select>
      <select
        aria-label="Indicador"
        className={cn(selectCls, "min-w-0 flex-1 sm:max-w-[260px]")}
        value={c.feature}
        onChange={(e) => {
          const s = featureSpec(e.target.value);
          onChange({ ...c, feature: e.target.value as Condition["feature"], op: s?.kind === "number" ? ">" : "==", value: defaultValue(s) });
        }}
      >
        {catalog.features.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
            {f.liveOnly ? " (ao vivo)" : ""}
          </option>
        ))}
      </select>
      <select aria-label="Operador" className={selectCls} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Op })}>
        {ops.map((o) => (
          <option key={o} value={o}>
            {o === "==" ? "=" : o === "!=" ? "≠" : o}
          </option>
        ))}
      </select>
      {spec?.kind === "number" ? (
        <input aria-label="Valor" type="number" step="any" className={cn(selectCls, "w-24")} value={Number(c.value)} onChange={(e) => onChange({ ...c, value: Number(e.target.value) })} />
      ) : spec?.kind === "boolean" ? (
        <select aria-label="Valor" className={selectCls} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value === "true" })}>
          <option value="true">sim</option>
          <option value="false">não</option>
        </select>
      ) : (
        <select aria-label="Valor" className={selectCls} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value })}>
          {spec?.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      <button onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger" aria-label="Remover condição">
        <X className="h-4 w-4" />
      </button>
      {spec?.hint ? <p className="w-full px-1 text-[10.5px] text-muted-foreground">{spec.hint}</p> : null}
    </div>
  );
}

function Editor({ def, setDef, catalog }: { def: StrategyDefinition; setDef: (d: StrategyDefinition) => void; catalog: Catalog }) {
  const setGroup = (i: number, g: StrategyDefinition["groups"][number]) => setDef({ ...def, groups: def.groups.map((x, j) => (j === i ? g : x)) });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted-foreground">Direção</span>
        <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Direção">
          {(["long", "short"] as const).map((d) => (
            <button key={d} role="radio" aria-checked={def.direction === d} onClick={() => setDef({ ...def, direction: d })} className={cn("h-7 rounded px-3", def.direction === d ? (d === "long" ? "bg-success/20 text-success" : "bg-danger/20 text-danger") : "text-muted-foreground")}>
              {d === "long" ? "Long" : "Short"}
            </button>
          ))}
        </div>
        <span className="ml-2 text-muted-foreground">Entre grupos</span>
        <select aria-label="Lógica entre grupos" className={selectCls} value={def.logic} onChange={(e) => setDef({ ...def, logic: e.target.value as "AND" | "OR" })}>
          <option value="AND">AND (todos)</option>
          <option value="OR">OR (qualquer)</option>
        </select>
      </div>
      {def.groups.map((g, i) => (
        <section key={i} className="rounded-lg border border-border p-2">
          <div className="mb-2 flex items-center gap-2 text-[12px]">
            <span className="font-semibold">Grupo {i + 1}</span>
            <select aria-label={`Lógica do grupo ${i + 1}`} className={selectCls} value={g.logic} onChange={(e) => setGroup(i, { ...g, logic: e.target.value as "AND" | "OR" })}>
              <option value="AND">AND — todas as condições</option>
              <option value="OR">OR — qualquer condição</option>
            </select>
            {def.groups.length > 1 ? (
              <button onClick={() => setDef({ ...def, groups: def.groups.filter((_, j) => j !== i) })} className="ml-auto text-[11.5px] text-muted-foreground hover:text-danger">
                Remover grupo
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            {g.conditions.map((c, k) => (
              <ConditionRow
                key={k}
                c={c}
                catalog={catalog}
                onChange={(n) => setGroup(i, { ...g, conditions: g.conditions.map((x, j) => (j === k ? n : x)) })}
                onRemove={() => (g.conditions.length > 1 ? setGroup(i, { ...g, conditions: g.conditions.filter((_, j) => j !== k) }) : undefined)}
              />
            ))}
          </div>
          <button
            onClick={() => setGroup(i, { ...g, conditions: [...g.conditions, { tf: g.conditions[g.conditions.length - 1]?.tf ?? "4h", feature: "rsi", op: "<", value: 50 }] })}
            disabled={g.conditions.length >= 12}
            className="mt-2 inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Condição
          </button>
        </section>
      ))}
      <button
        onClick={() => setDef({ ...def, groups: [...def.groups, { logic: "AND", conditions: [{ tf: "1h", feature: "last_event", op: "==", value: "BOS_bullish" }] }] })}
        disabled={def.groups.length >= 6}
        className="inline-flex h-8 items-center gap-1 self-start rounded-md border border-dashed border-border px-2.5 text-[12px] hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Grupo
      </button>
      <section className="rounded-lg border border-border p-2 text-[12.5px]">
        <div className="mb-2 font-semibold">Saída (backtest e plano)</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            Stop
            <select className={selectCls} value={def.exit.stop} onChange={(e) => setDef({ ...def, exit: { ...def.exit, stop: e.target.value as "atr" | "structure" } })}>
              <option value="atr">ATR × múltiplo</option>
              <option value="structure">Estrutural (último swing)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            ATR ×
            <input type="number" step="0.1" min={0.3} max={10} className={cn(selectCls, "w-20")} value={def.exit.atrMult} onChange={(e) => setDef({ ...def, exit: { ...def.exit, atrMult: Number(e.target.value) } })} />
          </label>
          <label className="flex items-center gap-1.5">
            Alvo (R)
            <input type="number" step="0.1" min={0.5} max={10} className={cn(selectCls, "w-20")} value={def.exit.rr} onChange={(e) => setDef({ ...def, exit: { ...def.exit, rr: Number(e.target.value) } })} />
          </label>
          <label className="flex items-center gap-1.5">
            Horizonte (candles)
            <input type="number" step="1" min={5} max={300} className={cn(selectCls, "w-20")} value={def.exit.horizon} onChange={(e) => setDef({ ...def, exit: { ...def.exit, horizon: Math.round(Number(e.target.value)) } })} />
          </label>
        </div>
      </section>
    </div>
  );
}

function Results({ ev }: { ev: LiveEvaluation }) {
  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <div className={cn("rounded-md px-3 py-2 font-semibold", ev.pass ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
        {ev.symbol}/USDT · {VENUE_LABEL[ev.dataVenue]} {INSTRUMENT_LABEL[ev.instrument]} · {ev.pass ? "Condições atendidas agora" : "Condições não atendidas"}
        {ev.price != null ? <span className="ml-2 font-normal">preço {formatPrice(ev.price)}</span> : null}
      </div>
      {ev.groups.map((g, i) => (
        <div key={i} className="rounded-md border border-border">
          <div className="border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
            Grupo {i + 1} ({g.logic}) · {g.pass ? "passa" : "não passa"}
          </div>
          {g.results.map((r, k) => (
            <div key={k} className="flex items-center gap-2 px-2 py-1">
              {r.pass ? <Check className="h-3.5 w-3.5 text-success" /> : <X className={cn("h-3.5 w-3.5", r.missing ? "text-warning" : "text-danger")} />}
              <span className="min-w-0 flex-1 truncate">{describeCondition(r.condition)}</span>
              <span className="tabular text-muted-foreground">{r.missing ? "n/d" : typeof r.actual === "number" ? r.actual.toFixed(2) : String(r.actual)}</span>
            </div>
          ))}
        </div>
      ))}
      {ev.missing.length ? <p className="text-[11px] text-warning">Sem dado: {ev.missing.join(", ")} (condição conta como falsa).</p> : null}
    </div>
  );
}

function BuilderInner() {
  const { data, mutate, error } = useSWR<Payload>("/api/strategies");
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [name, setName] = React.useState("Nova estratégia");
  const [description, setDescription] = React.useState("");
  const [def, setDef] = React.useState<StrategyDefinition>(EMPTY);
  const [symbol, setSymbol] = React.useState("BTC");
  const [exchange, setExchange] = React.useState<Venue>("binance");
  const [instrument, setInstrument] = React.useState<Instrument>("spot");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [ev, setEv] = React.useState<LiveEvaluation | null>(null);
  const [scan, setScan] = React.useState<{ rows: ScanRow[]; errors: string[] } | null>(null);

  const load = (s: { id?: string; name: string; description?: string | null; definition: StrategyDefinition }) => {
    setSelected(s.id ?? null);
    setName(s.name);
    setDescription(s.description ?? "");
    setDef(s.definition);
    setEv(null);
    setScan(null);
  };
  const fail = (title: string, err: unknown) => toast({ title, description: err instanceof ApiClientError ? err.message : String(err), variant: "danger" });

  const save = async () => {
    setBusy("save");
    try {
      if (selected) {
        await postJson(`/api/strategies/${selected}`, { name, description: description || null, definition: def }, "PATCH");
      } else {
        const r = await postJson<{ strategy: { id: string } }>("/api/strategies", { name, description: description || undefined, definition: def });
        setSelected(r.strategy.id);
      }
      await mutate();
      toast({ title: "Estratégia salva", variant: "success" });
    } catch (err) {
      fail("Não foi possível salvar", err);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!selected) return;
    setBusy("delete");
    try {
      await postJson(`/api/strategies/${selected}`, {}, "DELETE");
      await mutate();
      load({ name: "Nova estratégia", definition: EMPTY });
    } catch (err) {
      fail("Não foi possível excluir", err);
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      setEv(await postJson<LiveEvaluation>("/api/strategies/evaluate", { definition: def, symbol, exchange, instrument }));
    } catch (err) {
      fail("Falha ao avaliar", err);
    } finally {
      setBusy(null);
    }
  };
  const runScan = async () => {
    setBusy("scan");
    try {
      setScan(await postJson<{ rows: ScanRow[]; errors: string[] }>("/api/strategies/scan", { definition: def, exchange, instrument }));
    } catch (err) {
      fail("Falha no scanner", err);
    } finally {
      setBusy(null);
    }
  };

  const liveOnly = def.groups.flatMap((g) => g.conditions).some((c) => featureSpec(c.feature)?.liveOnly);
  return (
    <PageShell className="max-w-[1500px]">
      <PageTitle
        title="Strategies"
        description="Regras AND/OR com timeframe por condição (multi-timeframe nativo). A mesma estratégia roda no Market Scanner, no Market Monitor e no Backtest. Tudo sobre candles fechados."
      />
      {error ? <Alert variant="danger">{(error as Error).message}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between text-[12.5px]">
              <span className="font-semibold">Minhas estratégias</span>
              <span className="text-muted-foreground">{data ? `${data.items.length}/${data.limit}` : "…"}</span>
            </div>
            <div className="flex flex-col gap-1">
              {(data?.items ?? []).map((s) => (
                <button key={s.id} onClick={() => load(s)} className={cn("rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted", selected === s.id && "bg-primary/15 font-semibold")}>
                  {s.name}
                  <span className="block text-[10.5px] font-normal text-muted-foreground">
                    {s.definition.direction === "long" ? "Long" : "Short"} · {s.definition.groups.reduce((a, g) => a + g.conditions.length, 0)} condições
                  </span>
                </button>
              ))}
              {data && data.items.length === 0 ? <p className="text-[12px] text-muted-foreground">Nenhuma estratégia salva.</p> : null}
            </div>
            <button onClick={() => load({ name: "Nova estratégia", definition: EMPTY })} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-border text-[12px] hover:bg-muted">
              <Plus className="h-3.5 w-3.5" /> Nova
            </button>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-[12.5px] font-semibold">Modelos</div>
            {(data?.templates ?? []).map((t) => (
              <button key={t.name} onClick={() => load({ name: t.name, description: t.description, definition: t.definition })} className="mb-1 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted">
                <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  {t.name}
                  <span className="block text-[10.5px] text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input aria-label="Nome" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={() => void save()} disabled={busy !== null || !data} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
                <Save className="h-4 w-4" /> Salvar
              </button>
              {selected ? (
                <button onClick={() => void remove()} disabled={busy !== null} className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground hover:text-danger" aria-label="Excluir estratégia">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <input aria-label="Descrição" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className="mb-3 h-8 w-full rounded-md border border-input bg-background px-3 text-[12.5px] outline-none focus:ring-2 focus:ring-ring" />
            {data ? <Editor def={def} setDef={setDef} catalog={data.catalog} /> : <div className="skeleton h-48 rounded-md" />}
          </section>
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
              <select aria-label="Ativo" className={selectCls} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}/USDT
                  </option>
                ))}
              </select>
              <select aria-label="Exchange" className={selectCls} value={exchange} onChange={(e) => setExchange(e.target.value as Venue)}>
                {VENUES.map((v) => (
                  <option key={v} value={v}>
                    {VENUE_LABEL[v]}
                  </option>
                ))}
              </select>
              <select aria-label="Instrumento" className={selectCls} value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)}>
                {INSTRUMENTS.map((v) => (
                  <option key={v} value={v}>
                    {INSTRUMENT_LABEL[v]}
                  </option>
                ))}
              </select>
              <button onClick={() => void test()} disabled={busy !== null} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-semibold hover:bg-muted disabled:opacity-50">
                <Play className="h-3.5 w-3.5" /> {busy === "test" ? "Avaliando…" : "Testar agora"}
              </button>
              <button onClick={() => void runScan()} disabled={busy !== null} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-semibold hover:bg-muted disabled:opacity-50">
                <Radar className="h-3.5 w-3.5" /> {busy === "scan" ? "Varrendo 30 ativos…" : "Rodar no universo"}
              </button>
              {selected && !liveOnly ? (
                <Link href={`/backtest?strategy=${selected}&symbol=${symbol}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-semibold hover:bg-muted">
                  <FlaskConical className="h-3.5 w-3.5" /> Backtest
                </Link>
              ) : null}
              {selected ? (
                <Link href={`/monitor?strategy=${selected}&symbol=${symbol}&exchange=${exchange}&instrument=${instrument}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-semibold hover:bg-muted">
                  Monitorar
                </Link>
              ) : null}
            </div>
            {liveOnly ? <p className="mb-2 text-[11px] text-muted-foreground">Condições marcadas “ao vivo” (Confluence, setup, funding, OI) não existem no histórico: a estratégia roda no scanner e no monitor, mas não no backtest.</p> : null}
            {ev ? <Results ev={ev} /> : null}
            {scan ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] whitespace-nowrap text-[12.5px]">
                  <thead className="text-left text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">Ativo</th>
                      <th className="px-2 py-1">Resultado</th>
                      <th className="px-2 py-1 text-right">Condições</th>
                      <th className="px-2 py-1 text-right">Preço</th>
                      <th className="px-2 py-1">Dados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.rows.map((r) => (
                      <tr key={r.symbol} className="border-t border-border/60">
                        <td className="px-2 py-1 font-medium">
                          <Link href={`/?symbol=${r.symbol}&exchange=${exchange}&instrument=${instrument}`} className="hover:underline">
                            {r.symbol}/USDT
                          </Link>
                        </td>
                        <td className={cn("px-2 py-1 font-semibold", r.pass ? "text-success" : "text-muted-foreground")}>{r.pass ? "Atende" : "—"}</td>
                        <td className="tabular px-2 py-1 text-right">
                          {r.passedConditions}/{r.totalConditions}
                        </td>
                        <td className="tabular px-2 py-1 text-right">{r.price != null ? formatPrice(r.price) : "—"}</td>
                        <td className="px-2 py-1 text-[11px] text-muted-foreground">{VENUE_LABEL[r.dataVenue]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {scan.errors.length ? <p className="mt-1 text-[11px] text-warning">Sem dados: {scan.errors.slice(0, 5).join(" · ")}</p> : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">Estratégias descrevem condições técnicas; não são recomendação de investimento. Resultados passados não garantem resultados futuros.</p>
    </PageShell>
  );
}

export function StrategyBuilder() {
  return (
    <AccessGate feature="Strategies">
      <BuilderInner />
    </AccessGate>
  );
}
