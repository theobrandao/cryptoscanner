"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  BookOpen,
  Briefcase,
  CandlestickChart,
  ChevronDown,
  FlaskConical,
  Gauge,
  Globe2,
  HelpCircle,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Workflow,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/providers/theme-provider";
import { useSession } from "@/hooks/use-session";
import { useTickers } from "@/hooks/use-tickers";
import { ASSETS } from "@/lib/assets";
import { apiFetch } from "@/lib/client-api";
import { formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: string[] };

/** Navegação comercial (sidebar). Indicadores individuais vivem dentro de Charts. */
export const PRIMARY_NAV: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/panorama", label: "Markets", icon: Globe2, match: ["/panorama", "/bubbles"] },
  { href: "/scanner", label: "Market Scanner", icon: Radar },
  { href: "/sentinela", label: "Market Monitor", icon: Activity },
  { href: "/charts/BTC", label: "Charts", icon: CandlestickChart, match: ["/charts", "/graficos", "/terminal", "/fibonacci"] },
  { href: "/derivatives", label: "Derivatives", icon: Gauge },
  { href: "/agentes", label: "Strategies", icon: Workflow },
  { href: "/estatisticas", label: "Backtest", icon: FlaskConical },
  { href: "/risco", label: "Risk Management", icon: ShieldCheck },
  { href: "/carteira", label: "Portfolio", icon: Briefcase },
];

const SECONDARY_NAV: NavLink[] = [
  { href: "/carteira", label: "Watchlists", icon: Star },
  { href: "/carteira?tab=alerts", label: "Alerts", icon: Bell },
];

const FOOT_NAV: NavLink[] = [
  { href: "/preferencias", label: "Settings", icon: Settings },
  { href: "/suporte", label: "Help & Support", icon: HelpCircle },
  { href: "/jornada", label: "Academy", icon: BookOpen },
];

const MOBILE_NAV: NavLink[] = [
  { href: "/charts/BTC", label: "Charts", icon: CandlestickChart, match: ["/charts"] },
  { href: "/scanner", label: "Scanner", icon: Radar },
  { href: "/sentinela", label: "Monitor", icon: Activity },
  { href: "/risco", label: "Risk", icon: ShieldCheck },
];

function isActive(pathname: string, l: NavLink) {
  const roots = l.match ?? [l.href.split("?")[0] as string];
  return roots.some((r) => (r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(r + "/")));
}

export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="CryptoScanner — início">
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

function TrialCard() {
  const { user } = useSession();
  const { data } = useSWR<SubscriptionView>(user ? "/api/billing/subscription" : null, { revalidateOnFocus: false });
  if (!user || !data || (data.status !== "TRIALING" && data.status !== "EXPIRED" && data.status !== "PAST_DUE")) return null;
  const pct = data.daysLeft != null ? Math.max(0, Math.min(100, (data.daysLeft / data.trialDays) * 100)) : 0;
  return (
    <div className="mx-3 rounded-lg border border-border bg-elevated p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-warning/20 text-[10px] text-warning">◷</span>
        {data.status === "TRIALING" ? `${data.daysLeft} ${data.daysLeft === 1 ? "day" : "days"} left` : data.status === "PAST_DUE" ? "Payment pending" : "Trial ended"}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{data.status === "TRIALING" ? "in your free trial" : "choose your plan to continue"}</div>
      {data.status === "TRIALING" ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <Link href="/planos" className="mt-3 flex h-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110">
        Upgrade Now
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
    </Link>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-3 py-3">
      <div className="px-4 pb-1">
        <BrandMark />
      </div>
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Principal">
        {PRIMARY_NAV.map((l) => (
          <SideLink key={l.href} l={l} pathname={pathname} onClick={onNavigate} />
        ))}
      </nav>
      <div className="px-3">
        <Link href="/mentor" onClick={onNavigate} className="flex h-11 items-center gap-3 rounded-lg border border-border bg-gradient-to-r from-ai/20 to-primary/10 px-3 text-sm font-semibold hover:from-ai/30">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-ai to-primary text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          AI Analyst
        </Link>
      </div>
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Listas e alertas">
        {SECONDARY_NAV.map((l) => (
          <SideLink key={l.label} l={l} pathname={pathname} onClick={onNavigate} />
        ))}
      </nav>
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

const STRIP = ["BTC", "ETH", "SOL", "BNB", "XRP"];

function TickerStrip() {
  const { bySymbol } = useTickers();
  return (
    <div className="hidden min-w-0 items-center gap-5 overflow-hidden 2xl:flex" aria-label="Cotações">
      {STRIP.map((s) => {
        const t = bySymbol.get(s);
        const a = ASSETS.find((x) => x.symbol === s);
        return (
          <Link key={s} href={`/charts/${s}`} className="flex items-center gap-2 text-xs hover:opacity-80">
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
    </div>
  );
}

/** Estado do dado: LIVE quando o último ticker tem menos de 30 s; senão mostra o atraso real. */
function DataStatusPill() {
  const { data, connected } = useTickers();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const age = data ? Math.max(0, Math.round((now - data.fetchedAt) / 1000)) : null;
  const live = data != null && !data.stale && age != null && age < 30;
  return (
    <span
      className={cn("hidden h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold sm:inline-flex", live ? "text-success" : "text-warning")}
      title={data ? `Fonte: ${data.source} · ${connected ? "stream" : "polling"} · atualizado há ${age}s` : "sem dados"}
    >
      <span className={cn("h-2 w-2 rounded-full", live ? "bg-success live-dot" : "bg-warning")} />
      {live ? "Live Markets" : data ? (data.stale ? "Data from cache" : `Data delayed ${age}s`) : "Connecting…"}
    </span>
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
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-ai text-xs font-bold text-white">{initials}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {user.email} · {user.plan}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/preferencias")}>Settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/planos")}>Plans & billing</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/status")}>System health</DropdownMenuItem>
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
  const pages = [...PRIMARY_NAV, ...FOOT_NAV].filter((n) => term && n.label.toLowerCase().includes(term));
  const INDICATORS = ["EMA", "RSI", "MACD", "ATR", "Bollinger", "VWAP", "Fibonacci", "Volume Profile"].filter((i) => term && i.toLowerCase().includes(term));
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
              onKeyDown={(e) => e.key === "Enter" && assets[0] && go(`/charts/${assets[0].symbol}`)}
              placeholder="Search markets, pairs, indicators, strategies..."
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
            <button key={p.href} onClick={() => go(p.href)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <p.icon className="h-4 w-4 text-muted-foreground" /> {p.label}
            </button>
          ))}
          {INDICATORS.map((i) => (
            <button key={i} onClick={() => go(`/charts/BTC?ind=${encodeURIComponent(i)}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <CandlestickChart className="h-4 w-4 text-muted-foreground" /> {i} <span className="ml-auto text-xs text-muted-foreground">indicador no Charts</span>
            </button>
          ))}
          <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Markets</div>
          {assets.map((a) => (
            <button key={a.symbol} onClick={() => go(`/charts/${a.symbol}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
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

/**
 * Casca do produto: sidebar compacta (desktop), barra superior com busca global (Ctrl/Cmd+K),
 * cotações, estado do dado, notificações, tema e conta; navegação inferior no celular.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [menu, setMenu] = React.useState(false);
  const [search, setSearch] = React.useState(false);
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
            <span className="truncate">Search markets, pairs, indicators...</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[10px] sm:inline">⌘ K</kbd>
          </button>
          <TickerStrip />
          <div className="ml-auto flex items-center gap-1.5">
            <DataStatusPill />
            <Link href="/carteira?tab=alerts" className="grid h-9 w-9 place-items-center rounded-md hover:bg-muted" aria-label="Notificações">
              <Bell className="h-4 w-4" />
            </Link>
            <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-md hover:bg-muted" aria-label="Alternar tema">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <UserMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          Conteúdo técnico e educacional, não é recomendação de investimento. Dados: Binance, OKX, Kraken, CoinGecko, alternative.me. Confluence Score mede qualidade de confluência, não probabilidade.
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
          More
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
