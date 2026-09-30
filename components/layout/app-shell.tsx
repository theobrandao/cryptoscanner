"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Bell, Bot, Briefcase, CandlestickChart, ChevronDown, Clock, Home, LogIn, LogOut, Menu, Moon, Radar, Search, Eye, EyeOff, ShieldCheck, Sun } from "lucide-react";
import { ADVANCED_TOOLS, MAIN_TOOLS, TOOL_CATEGORIES } from "@/lib/tools";
import { RouteProgress } from "@/components/layout/route-progress";
import { ADVANCED_NAV, FOOT_NAV, PRIMARY_NAV, type NavLink } from "@/components/layout/nav-links";
import { useActiveSelection } from "@/hooks/use-market-selection";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { timeAgo } from "@/lib/format";
import { INSTRUMENT_LABEL, VENUE_LABEL } from "@/lib/venues";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/providers/theme-provider";
import { TIER_LABEL, useSession } from "@/hooks/use-session";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS, GLYPH_FONT_CLASS } from "@/lib/assets";
import { trackClient } from "@/lib/analytics-client";
import { SUPPORT_PATHS } from "@/lib/plans-copy";
import { apiFetch } from "@/lib/client-api";
import { formatPct, formatPrice } from "@/lib/format";
import { isOpenRoute, prefetchFor } from "@/lib/site";
import type { VenueStatus } from "@/services/market/venues";
import { cn } from "@/lib/utils";
import { AccessGate } from "@/components/account/access-gate";

/** Busca global e painel do Analista: código baixado só na primeira interação (não pesa nas páginas públicas). */
const loadSearch = () => import("@/components/layout/global-search");
const GlobalSearch = dynamic(loadSearch, { ssr: false });
const loadAnalyst = () => import("@/components/terminal/ai-analyst");
const AiAnalystPanel = dynamic(() => loadAnalyst().then((m) => m.AiAnalystPanel), { ssr: false });

/** true quando a media query casa; no servidor e na hidratação, false (nada que dependa disso vai no HTML). */
function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

const MOBILE_NAV: NavLink[] = [
  { href: "/", label: "Início", icon: Home, exact: true },
  { href: "/scanner/padroes", label: "Scanner", icon: Radar, match: ["/scanner/padroes"] },
  { href: "/graficos", label: "Gráficos", icon: CandlestickChart },
  { href: "/carteira", label: "Carteira", icon: Briefcase },
];

function isActive(pathname: string, l: NavLink) {
  const roots = l.match ?? [l.href.split("?")[0] as string];
  return roots.some((r) => (r === "/" || l.exact ? pathname === r : pathname === r || pathname.startsWith(r + "/")));
}

export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex min-h-10 items-center gap-2" aria-label="CryptoScanner — início">
      {/* logo oficial (public/brand); 96 px para telas de alta densidade */}
      <Image src="/brand/logo-96.png" alt="" width={32} height={32} priority className="h-8 w-8" />
      {!compact ? <span className="text-[17px] font-bold tracking-tight">CryptoScanner</span> : null}
    </Link>
  );
}

interface SubscriptionView {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "NONE";
  plan: string;
  daysLeft: number | null;
  trialDays: number;
  trialEndsAt: string | null;
}

type TrialLevel = "low" | "mid" | "high";
type TrialState = { kind: "trial"; level: TrialLevel; daysLeft: number; day: number; pct: number; ending: string | null } | { kind: "ended"; status: "EXPIRED" | "PAST_DUE" };

const DAY_MS = 86_400_000;
const hourLabel = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Estado do teste grátis para o cartão da barra lateral e a faixa do celular. A ênfase vem do tempo que falta
 * (o teste tem TRIAL_DAYS = 3 dias): último dia (menos de 24 h) → aviso, botão principal e "termina hoje/amanhã às…";
 * entre 24 e 48 h → botão principal; antes disso, discreto.
 */
function useTrialState(): TrialState | null {
  const { user } = useSession();
  const enabled = !!user && user.role !== "ADMIN";
  const { data } = useSWR<SubscriptionView>(enabled ? "/api/billing/subscription" : null, { revalidateOnFocus: false });
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [enabled]);
  if (!enabled || !data) return null;
  if (data.status === "EXPIRED" || data.status === "PAST_DUE") return { kind: "ended", status: data.status };
  if (data.status !== "TRIALING") return null;
  const total = data.trialDays * DAY_MS;
  const end = data.trialEndsAt ? new Date(data.trialEndsAt) : null;
  const msLeft = end ? Math.max(0, end.getTime() - now) : (data.daysLeft ?? 0) * DAY_MS;
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const day = Math.min(data.trialDays, Math.max(1, data.trialDays - daysLeft + 1));
  const level: TrialLevel = msLeft <= DAY_MS ? "high" : msLeft <= 2 * DAY_MS ? "mid" : "low";
  let ending: string | null = null;
  if (end && level === "high") {
    const today = new Date(now);
    const tomorrow = new Date(now + DAY_MS);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    ending = same(end, today) ? `Termina hoje às ${hourLabel(end)}` : same(end, tomorrow) ? `Termina amanhã às ${hourLabel(end)}` : null;
  }
  return { kind: "trial", level, daysLeft, day, pct: Math.max(0, Math.min(100, (msLeft / total) * 100)), ending };
}

const daysText = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Cartão do teste na barra lateral: "Teste grátis · N dias" + barra fina + Ver planos; teste encerrado → Escolher plano; pagamento pendente → suporte. */
function TrialCard() {
  const trial = useTrialState();
  if (!trial) return null;
  if (trial.kind === "ended")
    return (
      <div className="mx-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div className="text-[13px] font-semibold">{trial.status === "PAST_DUE" ? "Pagamento pendente" : "Teste encerrado"}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Sua conta e configurações continuam salvas.</div>
        <Link href={trial.status === "PAST_DUE" ? SUPPORT_PATHS.payment : "/planos"} onClick={() => trackClient("trial_card_click", { origin: "barra_lateral", level: trial.status === "PAST_DUE" ? "pagamento_pendente" : "encerrado" })} className="mt-2 flex h-8 items-center justify-center rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground hover:brightness-110">
          {trial.status === "PAST_DUE" ? "Resolver pagamento" : "Escolher plano"}
        </Link>
      </div>
    );
  const high = trial.level === "high";
  return (
    <div className={cn("mx-3 rounded-lg border p-3", high ? "border-warning/50 bg-warning/10" : trial.level === "mid" ? "border-primary/30 bg-elevated" : "border-border bg-elevated")}>
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-semibold">Teste grátis</span>
        <span className={cn("tabular", high ? "font-semibold text-warning" : "text-muted-foreground")}>{high && trial.ending ? "último dia" : daysText(trial.daysLeft)}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", high ? "bg-warning" : "bg-primary/70")} style={{ width: `${trial.pct}%` }} />
      </div>
      {high && trial.ending ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] font-medium text-warning">
          <Clock className="h-3 w-3" aria-hidden /> {trial.ending}
        </p>
      ) : null}
      <Link
        href="/planos"
        onClick={() => trackClient("trial_card_click", { origin: "barra_lateral", day: trial.day, level: trial.level })}
        className={cn("mt-2 flex h-8 items-center justify-center rounded-md text-[12.5px] font-semibold", trial.level === "low" ? "border border-border text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground hover:brightness-110")}
      >
        {high ? "Escolher plano" : "Ver planos"}
      </Link>
    </div>
  );
}

/** Faixa discreta do teste no celular (a barra lateral só aparece no menu): dias restantes e link para /planos. */
function MobileTrialStrip({ trial }: { trial: Extract<TrialState, { kind: "trial" }> }) {
  const high = trial.level === "high";
  return (
    <Link
      href="/planos"
      onClick={() => trackClient("trial_card_click", { origin: "faixa_celular", day: trial.day, level: trial.level })}
      className={cn("fixed inset-x-0 bottom-14 z-30 flex h-9 items-center gap-2 border-t px-4 text-[12.5px] backdrop-blur lg:hidden", high ? "border-warning/50 bg-warning/15 text-foreground" : "border-border bg-card/95 text-muted-foreground")}
    >
      <Clock className={cn("h-3.5 w-3.5 shrink-0", high ? "text-warning" : "text-primary")} aria-hidden />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-foreground">Teste grátis</span> · {high && trial.ending ? trial.ending.toLowerCase() : `${daysText(trial.daysLeft)} restantes`}
      </span>
      <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 font-semibold", high ? "text-warning" : "text-primary")}>
        Ver planos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function SideLink({ l, pathname, onClick, badge }: { l: NavLink; pathname: string; onClick?: () => void; badge?: number }) {
  const { user } = useSession();
  const active = isActive(pathname, l);
  const Icon = l.icon;
  return (
    <Link
      href={l.href}
      prefetch={prefetchFor(l.href, !!user)}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-primary/15 text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{l.label}</span>
      {badge ? <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge}</span> : null}
      {!badge && l.badge ? <span className="ml-auto rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-semibold text-warning">{l.badge}</span> : null}
    </Link>
  );
}

const ADMIN_LINK: NavLink = { href: "/admin", label: "Painel de controle", icon: ShieldCheck };

/** Seção só para o administrador (nada é renderizado para os demais, nem durante o carregamento da sessão). */
function AdminNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { user } = useSession();
  if (user?.role !== "ADMIN") return null;
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Administração">
      <span className="px-3 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Administração</span>
      <SideLink l={ADMIN_LINK} pathname={pathname} onClick={onNavigate} />
    </nav>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { selection } = useActiveSelection();
  const inAdvanced = ADVANCED_NAV.some((l) => isActive(pathname, l));
  const [advancedOpen, setAdvancedOpen] = useLocalStorage<boolean>("cs-nav-advanced", false);
  const open = advancedOpen || inAdvanced;
  const advanced = ADVANCED_NAV.map((l) => (l.href === "/charts" ? { ...l, href: `/charts/${selection.symbol}?tf=${selection.timeframe}&exchange=${selection.exchange}&instrument=${selection.instrument}` } : l));
  return (
    <div className="flex h-full flex-col gap-3 py-3">
      <div className="px-4 pb-1">
        <BrandMark />
      </div>
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Ferramentas">
        {PRIMARY_NAV.filter((l) => l.category === "Início").map((l) => (
          <SideLink key={l.href} l={l} pathname={pathname} onClick={onNavigate} />
        ))}
        {TOOL_CATEGORIES.map((c) => {
          const items = PRIMARY_NAV.filter((l) => l.category === c.key);
          if (!items.length) return null;
          return (
            <div key={c.key} className="mt-2 flex flex-col gap-0.5">
              <span className="px-3 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{c.label}</span>
              {items.map((l) => (
                <SideLink key={l.href} l={l} pathname={pathname} onClick={onNavigate} />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="px-2">
        <button
          onClick={() => setAdvancedOpen(!open)}
          aria-expanded={open}
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Avançado
          <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <nav className="mt-0.5 flex flex-col gap-0.5" aria-label="Ferramentas avançadas">
            {advanced.map((l) => (
              <SideLink key={l.label} l={l} pathname={pathname} onClick={onNavigate} />
            ))}
          </nav>
        ) : null}
      </div>
      <AdminNav pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-3">
        <TrialCard />
        <nav className="flex flex-col gap-0.5 px-2" aria-label="Conta">
          {FOOT_NAV.map((l) => (
            <SideLink key={l.label} l={l} pathname={pathname} onClick={onNavigate} />
          ))}
        </nav>
      </div>
    </div>
  );
}

const STRIP = ["BTC", "ETH", "SOL"];

/** Cotações no topo (só em telas xl): montada apenas quando visível; oculta pelo usuário, fica só o botão. */
function TickerStrip({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-4 overflow-hidden" aria-label="Cotações">
      <button onClick={onToggle} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={hidden ? "Mostrar cotações" : "Ocultar cotações"} title={hidden ? "Mostrar cotações" : "Ocultar cotações"}>
        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      {hidden ? null : <TickerStripItems />}
    </div>
  );
}

function TickerStripItems() {
  const { user } = useSession();
  const { bySymbol } = useTickers();
  return (
    <>
      {STRIP.map((s) => {
        const t = bySymbol.get(s);
        const a = ASSETS.find((x) => x.symbol === s);
        return (
          <Link key={s} href={`/graficos?symbol=${s}`} prefetch={prefetchFor("/graficos", !!user)} className="flex items-center gap-2 text-xs hover:opacity-80">
            <span className={cn("grid h-6 w-6 place-items-center rounded-full bg-muted text-[12px]", GLYPH_FONT_CLASS)}>{a?.glyph}</span>
            <span className="leading-tight">
              <span className="block font-semibold text-muted-foreground">{s}</span>
              <span className="tabular">
                {t ? formatPrice(t.price) : "—"}{" "}
                <span className={cn(t && t.changePct24h >= 0 ? "text-success" : "text-danger")}>{t ? formatPct(t.changePct24h) : ""}</span>
              </span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

const STATUS_TONE: Record<string, string> = { LIVE: "text-success", DELAYED: "text-warning", DEGRADED: "text-warning", FALLBACK: "text-info", OFFLINE: "text-danger" };

/**
 * "Live Markets" clicável → Market Data Status: estado por exchange (LIVE/DELAYED/DEGRADED/OFFLINE),
 * latência e última atualização, stream de preços e o contexto ativo.
 */
function MarketDataStatus() {
  // o botão só aparece a partir de sm: no celular não abre o stream de preços
  const visible = useMediaQuery("(min-width: 640px)");
  const { data, connected } = useTickers(visible);
  const { selection } = useActiveSelection();
  const [open, setOpen] = React.useState(false);
  const { data: st } = useSWR<{ checkedAt: number; venues: VenueStatus[] }>(open ? "/api/markets/status" : null, { refreshInterval: open ? 30_000 : 0 });
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const age = data ? Math.max(0, Math.round((now - data.fetchedAt) / 1000)) : null;
  const live = data != null && !data.stale && age != null && age < 30;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn("hidden h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted sm:inline-flex", live ? "text-success" : "text-warning")}
          aria-label="Estado dos dados de mercado"
        >
          <span className={cn("h-2 w-2 rounded-full", live ? "bg-success live-dot" : "bg-warning")} />
          {live ? "Ao vivo" : data ? (data.stale ? "Dados em cache" : `Atraso ${age}s`) : "Conectando…"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <div className="text-[13px] font-semibold">Estado dos dados de mercado</div>
          <div className="text-[11px] text-muted-foreground">
            Contexto ativo: {selection.symbol}/USDT · {VENUE_LABEL[selection.exchange]} {INSTRUMENT_LABEL[selection.instrument]} · {selection.timeframe.toUpperCase()}
          </div>
        </div>
        <ul className="divide-y divide-border text-[12px]">
          {(st?.venues ?? []).map((v) => (
            <li key={v.venue} className="flex items-center gap-2 px-3 py-2" title={v.error ?? undefined}>
              <span className="w-16 font-semibold">{v.label}</span>
              <span className={cn("w-20 font-semibold", STATUS_TONE[v.status])}>{v.status}</span>
              <span className="tabular w-14 text-right text-muted-foreground">{v.latencyMs != null ? `${v.latencyMs} ms` : "—"}</span>
              <span className="ml-auto truncate text-[11px] text-muted-foreground">{v.error ? v.error : timeAgo(v.checkedAt, now)}</span>
            </li>
          ))}
          {!st ? <li className="px-3 py-2 text-muted-foreground">Verificando exchanges…</li> : null}
          <li className="flex items-center gap-2 px-3 py-2">
            <span className="w-16 font-semibold">Preços</span>
            <span className={cn("w-20 font-semibold", live ? "text-success" : "text-warning")}>{live ? "LIVE" : data?.stale ? "DELAYED" : "DELAYED"}</span>
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {data ? `${data.source} · ${connected ? "stream" : "polling"} · ${age}s` : "sem dados"}
            </span>
          </li>
        </ul>
        <div className="border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground">
          LIVE &lt; 1,5 s · DEGRADED lento · DELAYED dado antigo · OFFLINE sem resposta. Detalhes em{" "}
          <Link href="/status" className="text-primary underline">
            Estado do sistema
          </Link>
          .
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NotifEvent {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  payload: { contextKey?: string } | null;
}

/** Sino: eventos do Market Monitor (in-app), contagem de não lidos, marcar como lidos. */
function NotificationsBell() {
  const { user } = useSession();
  const { data, mutate } = useSWR<{ items: NotifEvent[]; unread: number }>(user ? "/api/monitors/events?limit=8" : null, { refreshInterval: 60_000 });
  const unread = data?.unread ?? 0;
  if (!user)
    return (
      <Link href="/login" className="grid h-9 w-9 place-items-center rounded-md hover:bg-muted" aria-label="Notificações">
        <Bell className="h-4 w-4" />
      </Link>
    );
  return (
    <DropdownMenu
      onOpenChange={async (o) => {
        if (!o && unread) {
          await apiFetch("/api/monitors/events/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
          await mutate();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-muted" aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}>
          <Bell className="h-4 w-4" />
          {unread ? <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9.5px] font-bold text-primary-foreground">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-[13px] font-semibold">Notificações</div>
        {data && data.items.length === 0 ? <p className="px-3 py-3 text-[12px] text-muted-foreground">Sem eventos. Crie agentes ou monitores para receber avisos.</p> : null}
        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {(data?.items ?? []).map((e) => (
            <li key={e.id} className={cn("px-3 py-2 text-[12px]", !e.readAt && "bg-primary/5")}>
              <div className="font-semibold leading-snug">{e.title}</div>
              <p className="line-clamp-2 text-muted-foreground">{e.body}</p>
              <p className="text-[10.5px] text-muted-foreground">{timeAgo(e.createdAt)}</p>
            </li>
          ))}
        </ul>
        <Link href="/monitor" className="block border-t border-border px-3 py-2 text-center text-[12px] text-primary hover:bg-muted">
          Abrir monitores
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, tier, refresh } = useSession();
  const router = useRouter();
  if (!user)
    return (
      <Link href="/login" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
        <LogIn className="h-3.5 w-3.5" /> Entrar
      </Link>
    );
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded-full" aria-label="Conta">
          <span className="icon-tile grid h-9 w-9 place-items-center rounded-full text-xs font-bold ring-2 ring-background">{initials}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 w-fit rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{tier ? TIER_LABEL[tier] : "Conta"}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/preferencias")}>Preferências</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/planos")}>Planos e pagamento</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/status")}>Estado do sistema</DropdownMenuItem>
        {user.role === "ADMIN" ? <DropdownMenuItem onSelect={() => router.push("/admin")}>Painel de controle</DropdownMenuItem> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await apiFetch("/api/auth/logout", { method: "POST" });
            await refresh();
            router.push("/");
          }}
        >
          <LogOut className="h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Rotas de venda: sem menu do produto (foco na oferta). */
const SALES_ROUTES = ["/vendas"];

function featureName(p: string) {
  const t = [...MAIN_TOOLS, ...ADVANCED_TOOLS].find((x) => p === x.href || p.startsWith(x.href + "/"));
  return t?.name ?? "Esta ferramenta";
}

function SalesShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4">
          <BrandMark />
          <nav className="ml-6 hidden items-center gap-5 text-[13.5px] text-muted-foreground md:flex" aria-label="Seções">
            <a href="#ferramentas" className="inline-flex min-h-6 items-center hover:text-foreground">
              Ferramentas
            </a>
            <a href="#modelo" className="inline-flex min-h-6 items-center hover:text-foreground">
              Modelo
            </a>
            <a href="#planos" className="inline-flex min-h-6 items-center hover:text-foreground">
              Planos
            </a>
            <a href="#faq" className="inline-flex min-h-6 items-center hover:text-foreground">
              Dúvidas
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login?next=/" className="hidden h-9 items-center rounded-md px-3 text-[13.5px] font-medium hover:bg-muted sm:inline-flex">
              Entrar
            </Link>
            <Link href="/registro?next=/" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:brightness-110">
              Testar grátis
            </Link>
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
      <footer className="border-t border-border px-4 pb-24 pt-4 text-[11.5px] text-muted-foreground lg:pb-4">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2">
          <span>© CryptoScanner</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Documentos legais">
            <Link href="/termos" className="inline-flex min-h-6 items-center hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="inline-flex min-h-6 items-center hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/reembolso" className="inline-flex min-h-6 items-center hover:text-foreground">
              Cancelamento e reembolso
            </Link>
            <Link href="/suporte" className="inline-flex min-h-6 items-center hover:text-foreground">
              Suporte
            </Link>
            <Link href="/login?next=/" className="inline-flex min-h-6 items-center hover:text-foreground">
              Entrar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Botão do Analista IA: o painel (chat, markdown etc.) só é baixado no primeiro clique; hover/foco já adiantam o download. */
function AnalystLauncher() {
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const preload = () => void loadAnalyst();
  return (
    <>
      <button
        onClick={() => {
          setLoaded(true);
          setOpen(true);
          trackClient("analyst_open");
        }}
        onPointerEnter={preload}
        onFocus={preload}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-muted"
        aria-label="Analista IA"
      >
        <Bot className="h-4 w-4 text-primary" />
        <span className="hidden md:inline">Analista IA</span>
      </button>
      {loaded ? <AiAnalystPanel open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

/**
 * Casca do produto: sidebar compacta (desktop), barra superior com busca global (Ctrl/Cmd+K),
 * cotações, estado do dado, notificações, tema e conta; navegação inferior no celular.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user } = useSession();
  const [menu, setMenu] = React.useState(false);
  const [search, setSearch] = React.useState(false);
  const [searchLoaded, setSearchLoaded] = React.useState(false);
  const [hideTickers, setHideTickers] = useLocalStorage<boolean>("cs-hide-tickers", false);
  const wide = useMediaQuery("(min-width: 1280px)");
  const trial = useTrialState();
  const trialStrip = trial?.kind === "trial" ? trial : null;
  const openSearch = React.useCallback(() => {
    setSearchLoaded(true);
    setSearch(true);
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);
  if (SALES_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) return <SalesShell>{children}</SalesShell>;
  return (
    <div className="flex min-h-screen">
      <RouteProgress />
      <aside className="sticky top-0 hidden h-screen w-[210px] shrink-0 overflow-y-auto border-r border-border bg-card lg:block">
        <SidebarContent pathname={pathname} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur sm:px-4">
          <button className="grid h-9 w-9 place-items-center rounded-md hover:bg-muted lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="lg:hidden">
            <BrandMark compact />
          </span>
          <button
            onClick={openSearch}
            onPointerEnter={() => void loadSearch()}
            onFocus={() => void loadSearch()}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-muted-foreground hover:border-primary/40 md:max-w-sm"
            aria-label="Buscar ativo, ferramenta ou indicador (Ctrl+K)"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Buscar ativo, ferramenta ou indicador…</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[10px] sm:inline">⌘ K</kbd>
          </button>
          {wide ? <TickerStrip hidden={hideTickers} onToggle={() => setHideTickers(!hideTickers)} /> : null}
          <div className="ml-auto flex items-center gap-1.5">
            <MarketDataStatus />
            <AnalystLauncher />
            <NotificationsBell />
            <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-md hover:bg-muted max-[359px]:hidden" aria-label="Alternar tema">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <UserMenu />
          </div>
        </header>
        <main id="conteudo" className={cn("min-w-0 flex-1 lg:pb-0", trialStrip ? "pb-24" : "pb-16")}>
          <div key={pathname} className="page-enter">
            {isOpenRoute(pathname) ? children : <AccessGate feature={featureName(pathname)}>{children}</AccessGate>}
          </div>
        </main>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <span>
            Conteúdo técnico e educacional, não é recomendação de investimento. Dados: Binance, Bybit, OKX, Kraken, CoinGecko, CoinPaprika, BCB (PTAX), alternative.me. Confluence Score mede qualidade de confluência, não probabilidade.
          </span>
          <nav className="flex gap-3" aria-label="Documentos legais">
            <Link href="/termos" className="inline-flex min-h-6 items-center hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="inline-flex min-h-6 items-center hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/reembolso" className="inline-flex min-h-6 items-center hover:text-foreground">
              Cancelamento e reembolso
            </Link>
            <Link href="/planos" className="inline-flex min-h-6 items-center hover:text-foreground">
              Planos
            </Link>
          </nav>
        </footer>
      </div>

      {trialStrip ? <MobileTrialStrip trial={trialStrip} /> : null}

      {/* navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur lg:hidden" aria-label="Navegação móvel">
        {MOBILE_NAV.map((l) => {
          const active = isActive(pathname, l);
          return (
            <Link key={l.href} href={l.href} prefetch={prefetchFor(l.href, !!user)} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-primary" : "text-muted-foreground")}>
              <l.icon className="h-5 w-5" />
              {l.label}
            </Link>
          );
        })}
        <button onClick={() => setMenu(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground" aria-label="Mais">
          <Menu className="h-5 w-5" />
          Mais
        </button>
      </nav>

      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent className="left-0 top-0 h-full max-h-screen w-[80%] max-w-[260px] translate-x-0 translate-y-0 overflow-y-auto rounded-none border-r p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Menu</DialogTitle>
          </DialogHeader>
          <SidebarContent pathname={pathname} onNavigate={() => setMenu(false)} />
        </DialogContent>
      </Dialog>
      {searchLoaded ? <GlobalSearch open={search} onOpenChange={setSearch} /> : null}
    </div>
  );
}
