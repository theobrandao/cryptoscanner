"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Search, Sun, Star, LogIn, LogOut, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/providers/theme-provider";
import { useSession } from "@/hooks/use-session";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { ASSETS } from "@/lib/assets";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Início">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-sm font-black text-white shadow">CS</span>
      <span className="hidden sm:block leading-tight">
        <span className="block text-sm font-bold tracking-tight">CryptoScanner</span>
        <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">Padrões · Agentes IA</span>
      </span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { user, refresh } = useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-4">
        <Logo />
        <nav className="hidden xl:flex items-center gap-0.5 overflow-x-auto" aria-label="Principal">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground whitespace-nowrap",
                  active && "bg-muted text-foreground",
                )}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
                {item.badge ? (
                  <Badge variant="accent" className="px-1.5 py-0 text-[9px]">
                    {item.badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} aria-label="Buscar ativo">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline max-w-[120px] truncate">{user.name}</span>
                  <Badge variant={user.plan === "PLATINUM" ? "accent" : user.plan === "PRO" ? "default" : "muted"} className="px-1.5 py-0 text-[9px]">
                    {user.plan}
                  </Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => router.push("/carteira")}>💼 Carteira</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/agentes")}>🤖 Meus agentes</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/preferencias")}>⚙️ Preferências</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/planos")}>
                  <Star className="h-4 w-4" /> Planos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout()}>
                  <LogOut className="h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Entrar</span>
              </Button>
              <Button size="sm" onClick={() => router.push("/planos")} className="hidden sm:inline-flex">
                <Star className="h-4 w-4" /> Upgrade
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Menu off-canvas (mobile) */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-[85%] max-w-sm translate-x-0 translate-y-0 rounded-none border-l p-0">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle className="flex items-center justify-between">
              <span>Menu</span>
            </DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col p-2" aria-label="Menu principal">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted", pathname === item.href && "bg-muted")}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
                {item.badge ? (
                  <Badge variant="accent" className="ml-auto px-1.5 py-0 text-[9px]">
                    {item.badge}
                  </Badge>
                ) : null}
              </Link>
            ))}
            {!user ? (
              <Link href="/login" onClick={() => setMobileOpen(false)} className="mt-2 flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground">
                <LogIn className="h-4 w-4" /> Entrar
              </Link>
            ) : null}
          </nav>
        </DialogContent>
      </Dialog>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = React.useState("");
  const router = useRouter();
  const results = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    const assets = ASSETS.filter((a) => !term || a.symbol.toLowerCase().includes(term) || a.name.toLowerCase().includes(term)).slice(0, 8);
    const pages = NAV_ITEMS.filter((n) => term && n.label.toLowerCase().includes(term));
    return { assets, pages };
  }, [q]);
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 p-0">
        <DialogHeader className="p-3 pb-0">
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar ativo ou página…"
              className="pl-9"
              onKeyDown={(e) => e.key === "Enter" && results.assets[0] && go(`/graficos?symbol=${results.assets[0].symbol}`)}
            />
            {q ? (
              <button className="absolute right-2.5 top-2.5 opacity-60 hover:opacity-100 cursor-pointer" onClick={() => setQ("")} aria-label="Limpar">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.pages.length ? <div className="mb-1 px-2 text-[11px] uppercase tracking-wide text-muted-foreground">Páginas</div> : null}
          {results.pages.map((p) => (
            <button key={p.href} onClick={() => go(p.href)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted cursor-pointer">
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
          <div className="mb-1 mt-1 px-2 text-[11px] uppercase tracking-wide text-muted-foreground">Ativos</div>
          {results.assets.map((a) => (
            <button key={a.symbol} onClick={() => go(`/graficos?symbol=${a.symbol}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted cursor-pointer">
              <span className="w-5 text-center text-muted-foreground">{a.glyph}</span>
              <span className="font-semibold">{a.symbol}</span>
              <span className="text-muted-foreground">{a.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">abrir gráfico →</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
