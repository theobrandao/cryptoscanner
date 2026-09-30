"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Bell, Bot, Check, Crown, GraduationCap, LineChart, MessageSquareText, Radar, Send, Sparkles, Star, X } from "lucide-react";
import { useAccess } from "@/components/account/access-gate";
import { useFavorites, useLocalStorage } from "@/hooks/use-local-storage";
import { TIER_LABEL, useSession } from "@/hooks/use-session";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS } from "@/lib/assets";
import { LESSONS } from "@/lib/content/lessons";
import { formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProgressMap = Record<string, { done: boolean; score: number; at: string }>;
interface AgentsPayload {
  counts: Record<string, number>;
  limit: number;
}
interface MonitorsPayload {
  items: Array<{ id: string; active: boolean }>;
  limit: number;
}
interface AlertsPayload {
  items: Array<{ id: string; active: boolean }>;
}
interface WatchPayload {
  items: Array<{ symbol: string }>;
}

/* ───────────────────────── saudação ───────────────────────── */

const clockSubscribe = (cb: () => void) => {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
};
function readClock(): string {
  const now = new Date();
  const h = now.getHours();
  const greet = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now);
  return `${greet}|${date}`;
}

/** Saudação pelo horário local do navegador; no servidor/hidratação fica neutra (sem mismatch). */
export function Greeting() {
  const { user } = useSession();
  const clock = React.useSyncExternalStore(clockSubscribe, readClock, () => null);
  const first = user?.name?.split(/\s+/)[0];
  const [greet, date] = clock ? clock.split("|") : ["Olá", null];
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{first ? `${greet}, ${first}` : greet}</h1>
      <p className="h-5 text-[14px] text-muted-foreground">{date ?? " "}</p>
    </header>
  );
}

/* ───────────────────────── dados compartilhados ───────────────────────── */

function usePanelData() {
  const { user, telegramConnected } = useSession();
  const { access, loading: accessLoading } = useAccess();
  const core = Boolean(access?.entitlements.core);
  const agents = useSWR<AgentsPayload>(user && core ? "/api/agents?status=ALL" : null, { refreshInterval: 30_000 });
  const monitors = useSWR<MonitorsPayload>(user && core ? "/api/monitors" : null);
  const alerts = useSWR<AlertsPayload>(user && core ? "/api/alerts" : null, { refreshInterval: 30_000 });
  const watch = useSWR<WatchPayload>(user && core ? "/api/watchlist" : null, { refreshInterval: 15_000 });
  const [local] = useLocalStorage<ProgressMap>("cs-learning", {});
  const learning = useSWR<{ progress: ProgressMap }>(user ? "/api/learning" : null);
  const { favorites: starred } = useFavorites();

  const progress: ProgressMap = { ...local, ...(learning.data?.progress ?? {}) };
  const lessonsDone = LESSONS.filter((l) => progress[l.slug]?.done).length;
  const nextLesson = LESSONS.find((l) => !progress[l.slug]?.done) ?? null;
  const favorites = [...new Set([...starred, ...(watch.data?.items.map((i) => i.symbol) ?? [])])];

  const agentsTotal = agents.data ? Object.values(agents.data.counts).reduce((s, n) => s + n, 0) : 0;
  const agentsActive = agents.data?.counts.ACTIVE ?? 0;
  const monitorsActive = monitors.data?.items.filter((m) => m.active).length ?? 0;
  const alertsActive = alerts.data?.items.filter((a) => a.active).length ?? 0;
  const pending = (s: { data?: unknown; error?: unknown }) => accessLoading || (core && !s.data && !s.error);

  return {
    access,
    accessLoading,
    core,
    telegramConnected,
    agents: { ...agents, total: agentsTotal, active: agentsActive, loading: pending(agents) },
    monitors: { ...monitors, active: monitorsActive, total: monitors.data?.items.length ?? 0, loading: pending(monitors) },
    alerts: { ...alerts, active: alertsActive, total: alerts.data?.items.length ?? 0, loading: pending(alerts) },
    favorites,
    favoritesLoading: pending(watch),
    lessonsDone,
    nextLesson,
    learningLoading: Boolean(user) && !learning.data && !learning.error,
  };
}
type PanelData = ReturnType<typeof usePanelData>;

/* ───────────────────────── peças visuais ───────────────────────── */

const cardCls = "card-glow group relative flex min-h-[132px] flex-col gap-3 rounded-2xl border border-border p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function Tile({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span aria-hidden className="icon-tile grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-md shadow-primary/20">
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function CardHead({ icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Tile icon={icon} />
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <ArrowRight aria-hidden className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
    </div>
  );
}

function Lines() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <span className="skeleton h-6 w-20 rounded-md" />
      <span className="skeleton h-3.5 w-28 rounded" />
    </div>
  );
}

function Bar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "warning" }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full rounded-full", tone === "warning" ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg viewBox="0 0 40 40" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}

const Locked = () => <span className="text-[12px] text-muted-foreground">Requer plano ativo</span>;

/**
 * Cartão que é um link inteiro. Com `retry` (falha ao carregar) o cartão vira bloco com um link que cobre a área
 * e o botão "Tentar de novo" por cima: botão dentro de link não é permitido em HTML.
 */
function CardLink({ href, label, retry, children }: { href: string; label: string; retry?: React.ReactNode; children: React.ReactNode }) {
  if (!retry)
    return (
      <Link href={href} className={cardCls}>
        {children}
      </Link>
    );
  return (
    <div className={cardCls}>
      <Link href={href} aria-label={label} className="absolute inset-0 rounded-2xl" />
      {children}
      <div className="relative z-10">{retry}</div>
    </div>
  );
}

function RetryNote({ onRetry, dash }: { onRetry: () => void; dash?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground" role="alert">
      <span>{dash ? "“—” = não foi possível carregar." : "Não foi possível carregar."}</span>
      <button type="button" onClick={onRetry} className="font-semibold text-primary hover:underline">
        Tentar de novo
      </button>
    </div>
  );
}

/* ───────────────────────── cartões ───────────────────────── */

function AccessCard({ d }: { d: PanelData }) {
  const a = d.access;
  let body: React.ReactNode = <Lines />;
  if (!d.accessLoading && a) {
    if (a.tier === "TRIAL" && a.status === "TRIALING") {
      const left = a.daysLeft ?? 0;
      const low = left <= 1;
      body = (
        <>
          <div>
            <div className="text-[15px] font-bold leading-tight">Teste grátis</div>
            <div className={cn("tabular text-[12.5px]", low ? "text-warning" : "text-muted-foreground")}>
              {left} {left === 1 ? "dia restante" : "dias restantes"}
            </div>
          </div>
          <Bar pct={(left / a.trialDays) * 100} tone={low ? "warning" : "primary"} />
          <span className="text-[12px] font-semibold text-primary">Ver planos</span>
        </>
      );
    } else if (a.tier === "NONE") {
      body = (
        <>
          <div>
            <div className="text-[15px] font-bold leading-tight">{a.status === "PAST_DUE" ? "Pagamento pendente" : "Teste encerrado"}</div>
            <div className="text-[12.5px] text-muted-foreground">Sua conta e configurações continuam salvas.</div>
          </div>
          <span className="mt-auto inline-flex h-7 w-fit items-center rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground">Escolher plano</span>
        </>
      );
    } else {
      body = (
        <div>
          <div className="text-[15px] font-bold leading-tight">{TIER_LABEL[a.tier] ?? a.tier}</div>
          <div className="text-[12.5px] text-muted-foreground">{a.cancelAtPeriodEnd ? "Cancelamento no fim do período" : a.status === "PAST_DUE" ? "Pagamento pendente" : "Acesso ativo"}</div>
        </div>
      );
    }
  }
  return (
    <Link href="/planos" className={cardCls}>
      <CardHead icon={Crown} label="Acesso" />
      {body}
    </Link>
  );
}

function AgentsCard({ d }: { d: PanelData }) {
  const { agents } = d;
  const failed = !agents.loading && d.core && Boolean(agents.error);
  return (
    <CardLink href="/agentes" label="Abrir agentes" retry={failed ? <RetryNote onRetry={() => void agents.mutate()} /> : undefined}>
      <CardHead icon={Bot} label="Agentes" />
      {agents.loading ? (
        <Lines />
      ) : !d.core ? (
        <Locked />
      ) : agents.error ? null : (
        <div>
          <div className="tabular text-2xl font-extrabold leading-none">
            {agents.active}
            <span className="text-[14px] font-semibold text-muted-foreground">/{agents.data?.limit ?? "—"}</span>
          </div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">{agents.total ? `ativos · ${agents.total} no total` : "Nenhum agente criado"}</div>
        </div>
      )}
    </CardLink>
  );
}

function AlertsCard({ d }: { d: PanelData }) {
  const { monitors, alerts } = d;
  const loading = monitors.loading || alerts.loading;
  const failed = !loading && d.core && Boolean(monitors.error || alerts.error);
  const retry = () => {
    if (monitors.error) void monitors.mutate();
    if (alerts.error) void alerts.mutate();
  };
  return (
    <CardLink href="/monitor" label="Abrir alertas" retry={failed ? <RetryNote dash onRetry={retry} /> : undefined}>
      <CardHead icon={Bell} label="Alertas" />
      {loading ? (
        <Lines />
      ) : !d.core ? (
        <Locked />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="tabular text-2xl font-extrabold leading-none">
              {monitors.error ? "—" : monitors.active}
              {monitors.data ? <span className="text-[14px] font-semibold text-muted-foreground">/{monitors.data.limit}</span> : null}
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">monitores</div>
          </div>
          <div>
            <div className="tabular text-2xl font-extrabold leading-none">{alerts.error ? "—" : alerts.active}</div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">alertas ativos</div>
          </div>
        </div>
      )}
    </CardLink>
  );
}

function JourneyCard({ d }: { d: PanelData }) {
  const total = LESSONS.length;
  const next = d.nextLesson;
  return (
    <Link href={next ? `/jornada?aula=${next.slug}` : "/jornada"} className={cardCls}>
      <CardHead icon={GraduationCap} label="Jornada" />
      {d.learningLoading ? (
        <Lines />
      ) : (
        <div className="flex items-center gap-3">
          <Ring value={d.lessonsDone} total={total} />
          <div className="min-w-0">
            <div className="tabular text-[15px] font-bold leading-tight">
              {d.lessonsDone}/{total} aulas
            </div>
            <div className="truncate text-[12.5px] text-muted-foreground">{next ? `Continuar: aula ${next.order}` : "Jornada concluída"}</div>
          </div>
        </div>
      )}
    </Link>
  );
}

function FavoritesCard({ d }: { d: PanelData }) {
  const { bySymbol } = useTickers();
  const list = d.favorites.slice(0, 5);
  return (
    <div className="card-glow col-span-2 flex min-h-[132px] flex-col gap-3 rounded-2xl border border-border p-4 lg:col-span-4">
      <div className="flex items-center gap-2.5">
        <Tile icon={Star} />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Favoritos</span>
        <Link href="/scanner" className="ml-auto text-[12px] font-semibold text-primary hover:underline">
          Abrir scanner
        </Link>
      </div>
      {d.favoritesLoading && !list.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="status" aria-busy="true">
          <span className="sr-only">Carregando favoritos…</span>
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton h-[52px] rounded-xl" />
          ))}
        </div>
      ) : !list.length ? (
        <Link href="/scanner" className="flex h-[52px] items-center gap-2 rounded-xl border border-dashed border-border px-3 text-[13px] text-muted-foreground hover:border-primary/50 hover:text-foreground">
          <Star aria-hidden className="h-4 w-4 shrink-0" /> Adicione favoritos na estrela de qualquer ativo
        </Link>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {list.map((sym) => {
            const t = bySymbol.get(sym);
            const asset = ASSETS.find((a) => a.symbol === sym);
            return (
              <li key={sym}>
                <Link href={`/graficos?symbol=${sym}`} className="flex h-[52px] items-center gap-2 rounded-xl border border-border bg-card/60 px-3 transition-colors hover:border-primary/50">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[12px]">{asset?.glyph}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold leading-tight">{sym}</span>
                    <span className="tabular block truncate text-[11.5px] text-muted-foreground">{t ? formatPrice(t.price) : "—"}</span>
                  </span>
                  {t ? <span className={cn("tabular text-[12px] font-semibold", t.changePct24h >= 0 ? "text-success" : "text-danger")}>{formatPct(t.changePct24h, 1)}</span> : <span className="skeleton h-3.5 w-9 rounded" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── primeiros passos ───────────────────────── */

function Onboarding({ d }: { d: PanelData }) {
  const [dismissed, setDismissed] = useLocalStorage<boolean>("cs-onboarding-dismissed", false);
  const ready = !d.agents.loading && !d.monitors.loading && !d.alerts.loading && !d.favoritesLoading && !d.learningLoading;
  if (dismissed || !ready) return null;
  const items = [
    { label: "Criar um agente", href: "/agentes", done: d.agents.total > 0 },
    { label: "Ativar um alerta ou monitor", href: "/monitor", done: d.monitors.active + d.alerts.active > 0 },
    { label: "Favoritar um ativo", href: "/scanner", done: d.favorites.length > 0 },
    { label: "Concluir 1 aula da Jornada", href: "/jornada", done: d.lessonsDone > 0 },
    { label: "Conectar o Telegram", href: "/preferencias", done: d.telegramConnected },
  ];
  const n = items.filter((i) => i.done).length;
  if (n === items.length) return null;
  return (
    <section aria-label="Primeiros passos" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Tile icon={Sparkles} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-tight">Primeiros passos</h2>
          <p className="tabular text-[12.5px] text-muted-foreground">
            {n} de {items.length} concluídos
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ocultar primeiros passos">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <Bar pct={(n / items.length) * 100} />
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className={cn("flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors", i.done ? "border-success/30 bg-success/5 text-muted-foreground" : "border-border hover:border-primary/50 hover:text-foreground")}>
              <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", i.done ? "border-success bg-success text-white dark:text-background" : "border-muted-foreground/40")}>{i.done ? <Check className="h-3 w-3" /> : null}</span>
              <span className={cn("truncate", i.done && "line-through decoration-muted-foreground/40")}>
                {i.label}
                <span className="sr-only"> {i.done ? "(concluído)" : "(pendente)"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── ações rápidas ───────────────────────── */

const ACTIONS = [
  { label: "Escanear agora", href: "/scanner", icon: Radar },
  { label: "Análise completa", href: "/terminal", icon: LineChart },
  { label: "Novo agente", href: "/agentes", icon: Send },
  { label: "Perguntar ao Analista IA", href: "/analista", icon: MessageSquareText },
];

export function QuickActions() {
  return (
    <nav aria-label="Ações rápidas" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {ACTIONS.map((a) => (
        <Link key={a.href} href={a.href} className="group flex h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <a.icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{a.label}</span>
          <ArrowRight aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary" />
        </Link>
      ))}
    </nav>
  );
}

/** "Seu painel": acesso, agentes, alertas, jornada e favoritos com dados reais + checklist de primeiros passos. */
export function MyPanel() {
  const d = usePanelData();
  return (
    <>
      <section aria-label="Seu painel" className="flex flex-col gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Seu painel</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AccessCard d={d} />
          <AgentsCard d={d} />
          <AlertsCard d={d} />
          <JourneyCard d={d} />
          <FavoritesCard d={d} />
        </div>
      </section>
      <Onboarding d={d} />
    </>
  );
}
