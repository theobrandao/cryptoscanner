"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Briefcase,
  CandlestickChart,
  ChevronDown,
  HelpCircle,
  Home,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Radar,
  Search,
  Eye,
  EyeOff,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { ADVANCED_TOOLS, MAIN_TOOLS, TOOL_CATEGORIES, type Tool } from "@/lib/tools";
import { toolIconComponent } from "@/components/layout/tool-icon";
import { AiAnalystButton } from "@/components/terminal/ai-analyst";
import { useActiveSelection } from "@/hooks/use-market-selection";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { timeAgo } from "@/lib/format";
import { INSTRUMENT_LABEL, VENUE_LABEL } from "@/lib/venues";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/providers/theme-provider";
import { useSession } from "@/hooks/use-session";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS } from "@/lib/assets";
import { apiFetch } from "@/lib/client-api";
import { formatPct, formatPrice } from "@/lib/format";
import type { VenueStatus } from "@/services/market/venues";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: string[]; exact?: boolean; badge?: string; category?: string };

const fromTool = (t: Tool): NavLink => ({ href: t.href, label: t.name, icon: toolIconComponent(t.icon), match: t.match, exact: t.exact, badge: t.badge, category: t.category });

/** Menu principal: uma ferramenta por finalidade (lib/tools.ts). */
const PRIMARY_NAV: NavLink[] = MAIN_TOOLS.map(fromTool);

/** Grupo recolhido "Avançado": análise profunda. */
const ADVANCED_NAV: NavLink[] = ADVANCED_TOOLS.map(fromTool);

const FOOT_NAV: NavLink[] = [
  { href: "/planos", label: "Planos", icon: Briefcase },
  { href: "/suporte", label: "Suporte", icon: HelpCircle },
  { href: "/preferencias", label: "Preferências", icon: Settings },
];

/** Páginas fora do menu, acessíveis pela busca global. */
const EXTRA_PAGES: NavLink[] = [
  { href: "/terminal", label: "Terminal", icon: CandlestickChart },
  { href: "/carteira?tab=alerts", label: "Alertas de preço", icon: Bell },
  { href: "/status", label: "Estado do sistema", icon: Activity },
];

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
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary" aria-hidden>
        <rect x="2" y="11" width="4" height="9" rx="1" fill="currentColor" opacity="0.55" />
        <rect x="8" y="6" width="4" height="14" rx="1" fill="currentColor" opacity="0.8" />
        <rect x="14" y="3" width="4" height="17" rx="1" fill="currentColor" />
        <path d="M2 9 L9 4 L14 6 L22 1" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
      {!compact ? <span className="text-[17px] font-bold tracking-tight">CryptoScanner</span> : null}
    </Link>
  );
}

interface SubscriptionView {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "NONE";
  plan: string;
  daysLeft: number | null;
  trialDays: number;
}

/**
 * Trial discreto: "Trial · N days left" + barra fina + View Plans. A ênfase cresce no fim do teste:
 * dias 1–3 neutro, 4–5 destaque leve, 6–7 aviso; expirado → "Choose Your Plan".
 */
function TrialCard() {
  const { user } = useSession();
  const { data } = useSWR<SubscriptionView>(user ? "/api/billing/subscription" : null, { revalidateOnFocus: false });
  if (!user || !data || (data.status !== "TRIALING" && data.status !== "EXPIRED" && data.status !== "PAST_DUE")) return null;
  if (data.status !== "TRIALING")
    return (
      <div className="mx-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div className="text-[13px] font-semibold">{data.status === "PAST_DUE" ? "Pagamento pendente" : "Teste encerrado"}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Sua conta e configurações continuam salvas.</div>
        <Link href="/planos" className="mt-2 flex h-8 items-center justify-center rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground hover:brightness-110">
          Escolher plano
        </Link>
      </div>
    );
  const left = data.daysLeft ?? 0;
  const day = Math.min(data.trialDays, Math.max(1, data.trialDays - left + 1)); // dia do teste (1..7)
  const level = day >= 6 ? "high" : day >= 4 ? "mid" : "low";
  const pct = Math.max(0, Math.min(100, (left / data.trialDays) * 100));
  return (
    <div className={cn("mx-3 rounded-lg border p-3", level === "high" ? "border-warning/40 bg-warning/5" : "border-border bg-elevated")}>
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-semibold">Teste grátis</span>
        <span className={cn("tabular", level === "high" ? "text-warning" : "text-muted-foreground")}>
          {left} {left === 1 ? "dia" : "dias"}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", level === "high" ? "bg-warning" : "bg-primary/70")} style={{ width: `${pct}%` }} />
      </div>
      <Link
        href="/planos"
        className={cn(
          "mt-2 flex h-8 items-center justify-center rounded-md text-[12.5px] font-semibold",
          level === "low" ? "border border-border text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground hover:brightness-110",
        )}
      >
        Ver planos
      </Link>
    </div>
  );
}

function SideLink({ l, pathname, onClick, badge }: { l: NavLink; pathname: string; onClick?: () => void; badge?: number }) {
  const active = isActive(pathname, l);
  const Icon = l.icon;
  return (
    <Link
      href={l.href}
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

function TickerStrip({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const { bySymbol } = useTickers();
  return (
    <div className="hidden min-w-0 items-center gap-4 overflow-hidden xl:flex" aria-label="Cotações">
      <button onClick={onToggle} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={hidden ? "Mostrar cotações" : "Ocultar cotações"} title={hidden ? "Mostrar cotações" : "Ocultar cotações"}>
        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      {hidden ? null : (
        <>
      {STRIP.map((s) => {
        const t = bySymbol.get(s);
        const a = ASSETS.find((x) => x.symbol === s);
        return (
          <Link key={s} href={`/graficos?symbol=${s}`} className="flex items-center gap-2 text-xs hover:opacity-80">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[12px]">{a?.glyph}</span>
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
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = { LIVE: "text-success", DELAYED: "text-warning", DEGRADED: "text-warning", FALLBACK: "text-info", OFFLINE: "text-danger" };

/**
 * "Live Markets" clicável → Market Data Status: estado por exchange (LIVE/DELAYED/DEGRADED/OFFLINE),
 * latência e última atualização, stream de preços e o contexto ativo.
 */
function MarketDataStatus() {
  const { data, connected } = useTickers();
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
  const { user, refresh } = useSession();
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
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/20 text-xs font-bold text-foreground">{initials}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {user.email} · {user.plan}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/preferencias")}>Preferências</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/planos")}>Planos e pagamento</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/status")}>Estado do sistema</DropdownMenuItem>
        {user.role === "ADMIN" ? <DropdownMenuItem onSelect={() => router.push("/admin")}>Admin</DropdownMenuItem> : null}
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

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = React.useState("");
  const router = useRouter();
  const term = q.trim().toLowerCase();
  const assets = ASSETS.filter((a) => !term || a.symbol.toLowerCase().includes(term) || a.name.toLowerCase().includes(term)).slice(0, 8);
  const pages = [...PRIMARY_NAV, ...ADVANCED_NAV, ...FOOT_NAV, ...EXTRA_PAGES].filter((n) => term && n.label.toLowerCase().includes(term));
  const INDICATORS = ["EMA", "RSI", "MACD", "ATR", "Bollinger", "StochRSI"].filter((i) => term && i.toLowerCase().includes(term));
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 p-0">
        <DialogHeader className="p-3 pb-0">
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && assets[0] && go(`/graficos?symbol=${assets[0].symbol}`)}
              placeholder="Buscar ativo, ferramenta ou indicador…"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
            {q ? (
              <button className="absolute right-3 top-3 opacity-60 hover:opacity-100" onClick={() => setQ("")} aria-label="Limpar">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto p-2 text-sm">
          {pages.map((p) => (
            <button key={p.label} onClick={() => go(p.href)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <p.icon className="h-4 w-4 text-muted-foreground" /> {p.label}
            </button>
          ))}
          {INDICATORS.map((i) => (
            <button key={i} onClick={() => go(`/graficos`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <CandlestickChart className="h-4 w-4 text-muted-foreground" /> {i} <span className="ml-auto text-xs text-muted-foreground">indicador · Gráficos</span>
            </button>
          ))}
          <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Ativos</div>
          {assets.map((a) => (
            <button key={a.symbol} onClick={() => go(`/graficos?symbol=${a.symbol}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <span className="w-5 text-center text-muted-foreground">{a.glyph}</span>
              <span className="font-semibold">{a.symbol}/USDT</span>
              <span className="text-muted-foreground">{a.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Rotas de venda: sem menu do produto (foco na oferta). */
const SALES_ROUTES = ["/vendas"];

function SalesShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4">
          <BrandMark />
          <nav className="ml-6 hidden items-center gap-5 text-[13.5px] text-muted-foreground md:flex" aria-label="Seções">
            <a href="#ferramentas" className="hover:text-foreground">
              Ferramentas
            </a>
            <a href="#modelo" className="hover:text-foreground">
              Modelo
            </a>
            <a href="#planos" className="hover:text-foreground">
              Planos
            </a>
            <a href="#faq" className="hover:text-foreground">
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
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/reembolso" className="hover:text-foreground">
              Cancelamento e reembolso
            </Link>
            <Link href="/suporte" className="hover:text-foreground">
              Suporte
            </Link>
            <Link href="/login?next=/" className="hover:text-foreground">
              Entrar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * Casca do produto: sidebar compacta (desktop), barra superior com busca global (Ctrl/Cmd+K),
 * cotações, estado do dado, notificações, tema e conta; navegação inferior no celular.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [menu, setMenu] = React.useState(false);
  const [search, setSearch] = React.useState(false);
  const [hideTickers, setHideTickers] = useLocalStorage<boolean>("cs-hide-tickers", false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (SALES_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) return <SalesShell>{children}</SalesShell>;
  return (
    <div className="flex min-h-screen">
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
            onClick={() => setSearch(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-muted-foreground hover:border-primary/40 md:max-w-sm"
            aria-label="Buscar (Ctrl+K)"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Buscar ativo, ferramenta ou indicador…</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[10px] sm:inline">⌘ K</kbd>
          </button>
          <TickerStrip hidden={hideTickers} onToggle={() => setHideTickers(!hideTickers)} />
          <div className="ml-auto flex items-center gap-1.5">
            <MarketDataStatus />
            <AiAnalystButton />
            <NotificationsBell />
            <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-md hover:bg-muted max-[359px]:hidden" aria-label="Alternar tema">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <UserMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <span>
            Conteúdo técnico e educacional, não é recomendação de investimento. Dados: Binance, Bybit, OKX, Kraken, CoinGecko, CoinPaprika, BCB (PTAX), alternative.me. Confluence Score mede qualidade de confluência, não probabilidade.
          </span>
          <nav className="flex gap-3" aria-label="Documentos legais">
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/reembolso" className="hover:text-foreground">
              Cancelamento e reembolso
            </Link>
            <Link href="/planos" className="hover:text-foreground">
              Planos
            </Link>
          </nav>
        </footer>
      </div>

      {/* navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur lg:hidden" aria-label="Navegação móvel">
        {MOBILE_NAV.map((l) => {
          const active = isActive(pathname, l);
          return (
            <Link key={l.href} href={l.href} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-primary" : "text-muted-foreground")}>
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
      <GlobalSearch open={search} onOpenChange={setSearch} />
    </div>
  );
}
