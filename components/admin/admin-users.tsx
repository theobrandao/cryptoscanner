"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { ChevronLeft, ChevronRight, Download, Search, Send } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hint } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { useSession } from "@/hooks/use-session";
import { ACTION_LABEL, actionBlockedReason, initials, PROVIDER_LABEL, STATUS_LABEL_ADMIN, TIER_LABEL_ADMIN, validityLabel, type AdminAction, type AdminSort, type AdminStatus } from "@/lib/admin-users";
import type { Tier } from "@/lib/entitlements";
import { apiFetch, postJson } from "@/lib/client-api";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Nomes dos eventos de uso em português para o painel. */
export const EVENT_LABEL: Record<string, string> = { signup: "cadastro", trial_started: "início do teste", login: "entrada", dashboard_view: "abriu a análise completa", context_change: "trocou de ativo", analyst_open: "abriu o Analista IA", monitor_created: "criou monitor", strategy_created: "criou estratégia", backtest_run: "rodou backtest", plans_view: "viu os planos", checkout_started: "iniciou pagamento", subscription_activated: "assinatura ativada", payment_failed: "pagamento recusado", subscription_cancelled: "assinatura cancelada" };


export interface UserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastAccessAt: string | null;
  loginMethod: "google" | "senha";
  role: "USER" | "ADMIN";
  isOwner: boolean;
  tier: Tier;
  status: AdminStatus;
  subscription: { plan: string; status: string; provider: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
  blockedAt: string | null;
  blockedReason: string | null;
  counts: { agents: number; monitors: number; alerts: number; strategies: number };
  telegramConnected: boolean;
}

interface ListResponse {
  rows: UserRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  totals: { all: number; TRIAL: number; PRO: number; ELITE: number; NONE: number; ADMIN: number; blocked: number };
}

interface AuditRow {
  id: string;
  adminEmail: string;
  targetEmail: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface DetailResponse {
  user: UserRow;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  onboardedAt: string | null;
  preference: { theme: string; currency: string; defaultTimeframe: string; language: string; lessonsDone: number } | null;
  accessLogs: Array<{ ip: string; event: string; createdAt: string }>;
  grants: Array<{ provider: string; externalId: string; plan: string; status: string; currentPeriodEnd: string | null; lastEvent: string; lastOrderId: string | null; appliedAt: string | null; createdAt: string; updatedAt: string }>;
  audit: AuditRow[];
  events: Array<{ name: string; createdAt: string }>;
}

type Chip = { key: string; label: string; tier?: Tier; status?: AdminStatus; count: (t: ListResponse["totals"]) => number };
const CHIPS: Chip[] = [
  { key: "all", label: "Todos", count: (t) => t.all },
  { key: "TRIAL", label: "Teste grátis", tier: "TRIAL", count: (t) => t.TRIAL },
  { key: "PRO", label: "PRO", tier: "PRO", count: (t) => t.PRO },
  { key: "ELITE", label: "ELITE", tier: "ELITE", count: (t) => t.ELITE },
  { key: "NONE", label: "Sem acesso", tier: "NONE", count: (t) => t.NONE },
  { key: "blocked", label: "Bloqueados", status: "bloqueado", count: (t) => t.blocked },
  { key: "ADMIN", label: "Administradores", tier: "ADMIN", count: (t) => t.ADMIN },
];

const SORT_LABEL: Record<AdminSort, string> = { recentes: "Cadastro mais recente", ultimo_acesso: "Último acesso", nome: "Nome (A-Z)" };

export const TIER_VARIANT: Record<Tier, BadgeProps["variant"]> = { TRIAL: "default", PRO: "outline", ELITE: "accent", NONE: "muted", ADMIN: "warning" };

const ACCESS_EVENT_LABEL: Record<string, string> = { login: "Entrou", register: "Criou a conta", password_reset: "Redefiniu a senha", account_deleted: "Conta excluída" };
const GRANT_STATUS_LABEL: Record<string, string> = { ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCELLED: "Cancelada", EXPIRED: "Encerrada" };
const SUB_STATUS_LABEL: Record<string, string> = { TRIALING: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCELLED: "Cancelada (vale até o fim do período)", EXPIRED: "Encerrada" };

const fmtDay = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(v)) : "—");

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AccessBadges({ u }: { u: Pick<UserRow, "tier" | "blockedAt"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={TIER_VARIANT[u.tier]}>{TIER_LABEL_ADMIN[u.tier]}</Badge>
      {u.blockedAt ? <Badge variant="danger">Bloqueado</Badge> : null}
    </span>
  );
}

function Avatar({ u, className }: { u: Pick<UserRow, "name" | "email">; className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground", className)}>
      {initials(u.name, u.email)}
    </span>
  );
}

function Usage({ c }: { c: UserRow["counts"] }) {
  return (
    <span className="tabular text-[11.5px] text-muted-foreground" title={`${c.agents} agentes · ${c.monitors} monitores · ${c.alerts} alertas · ${c.strategies} estratégias`}>
      {c.agents} ag · {c.monitors} mon · {c.alerts} al
    </span>
  );
}

function TelegramMark({ on }: { on: boolean }) {
  return on ? (
    <span title="Telegram conectado" className="inline-flex text-accent">
      <Send className="h-3.5 w-3.5" aria-label="Telegram conectado" />
    </span>
  ) : null;
}

export function AdminUsersTab() {
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search.trim(), 300);
  const [chip, setChip] = React.useState("all");
  const [sort, setSort] = React.useState<AdminSort>("recentes");
  const filterKey = `${q}|${chip}|${sort}`;
  // a página volta para 1 quando busca, filtro ou ordem mudam
  const [pageState, setPageState] = React.useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterKey, page: p });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const c = CHIPS.find((x) => x.key === chip) ?? CHIPS[0]!;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (c.tier) params.set("tier", c.tier);
  if (c.status) params.set("status", c.status);
  params.set("sort", sort);
  const exportHref = `/api/admin/users/export?${params.toString()}`;
  params.set("page", String(page));
  const { data, error, isLoading } = useSWR<ListResponse>(`/api/admin/users?${params.toString()}`, { keepPreviousData: true });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:max-w-sm md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-9" aria-label="Buscar usuário" />
        </div>
        <div className="flex gap-2 md:ml-auto">
          <Select value={sort} onValueChange={(v) => setSort(v as AdminSort)}>
            <SelectTrigger className="md:w-52" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as AdminSort[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a href={exportHref} download className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted sm:h-9">
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por acesso">
        {CHIPS.map((x) => (
          <button
            key={x.key}
            onClick={() => setChip(x.key)}
            aria-pressed={chip === x.key}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors", chip === x.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {x.label}
            <span className="tabular text-[11px] opacity-70">{data ? x.count(data.totals) : "·"}</span>
          </button>
        ))}
      </div>
      {error ? <Alert variant="danger">{(error as Error).message}</Alert> : null}
      {!data && isLoading ? <ListSkeleton /> : null}
      {data && data.rows.length === 0 ? <EmptyState title={q || chip !== "all" ? "Nenhum usuário com esse filtro" : "Nenhum usuário cadastrado ainda"} description={q || chip !== "all" ? "Mude a busca ou escolha outro filtro." : undefined} /> : null}
      {data && data.rows.length > 0 ? (
        <>
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => setOpenId(u.id)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), setOpenId(u.id)) : undefined)}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar u={u} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate font-medium">
                            <span className="truncate">{u.name}</span>
                            <TelegramMark on={u.telegramConnected} />
                          </div>
                          <div className="truncate text-[12px] text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AccessBadges u={u} />
                    </TableCell>
                    <TableCell className="text-[12.5px]">{validityLabel(u.tier, u.subscription)}</TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">{u.lastAccessAt ? timeAgo(u.lastAccessAt) : "—"}</TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">{fmtDay(u.createdAt)}</TableCell>
                    <TableCell>
                      <Usage c={u.counts} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {data.rows.map((u) => (
              <li key={u.id}>
                <button onClick={() => setOpenId(u.id)} className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/50">
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <Avatar u={u} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{u.name}</span>
                        <TelegramMark on={u.telegramConnected} />
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <AccessBadges u={u} />
                    <span>{validityLabel(u.tier, u.subscription)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                    <span>Último acesso: {u.lastAccessAt ? timeAgo(u.lastAccessAt) : "—"}</span>
                    <span>Cadastro: {fmtDay(u.createdAt)}</span>
                    <Usage c={u.counts} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
            <span>
              {data.total} {data.total === 1 ? "usuário" : "usuários"} · página {data.page} de {data.pages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Próxima página">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      ) : null}
      <UserDetailDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando usuários">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-5 w-20 md:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Detalhes do usuário (painel lateral)
// ------------------------------------------------------------------

type Pending = "grant" | "extend_trial" | "revoke" | "end_sessions" | "block" | "unblock" | "password_reset" | "delete" | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function providerLabel(u: UserRow): string {
  if (u.tier === "ADMIN") return "administrador";
  if (!u.subscription) return "—";
  if (u.subscription.status === "TRIALING" || (!u.subscription.provider && u.subscription.trialEndsAt)) return "teste";
  return u.subscription.provider ? (PROVIDER_LABEL[u.subscription.provider] ?? u.subscription.provider) : "—";
}

export function describeAudit(r: Pick<AuditRow, "action" | "details">): string {
  const d = r.details ?? {};
  if (r.action === "grant") return `${String(d.plan ?? "")} · ${d.days == null ? "sem prazo" : `${String(d.days)} dias`}${d.currentPeriodEnd ? ` · até ${fmtDay(String(d.currentPeriodEnd))}` : ""}`;
  if (r.action === "extend_trial") return `+${String(d.days ?? "")} dias · teste até ${fmtDay(d.trialEndsAt ? String(d.trialEndsAt) : null)}`;
  if (r.action === "block") return d.reason ? `Motivo: ${String(d.reason)}` : "Sem motivo informado";
  if (r.action === "password_reset") return d.emailEnabled === false ? "E-mail não configurado: link não enviado" : "Link enviado por e-mail";
  if (r.action === "delete") return d.name ? `Nome: ${String(d.name)}` : "";
  return "";
}

function ActionButton({ reason, onClick, label, variant }: { reason: string | null; onClick: () => void; label: string; variant: "outline" | "danger" }) {
  const btn = (
    <Button size="sm" variant={variant} disabled={Boolean(reason)} onClick={onClick}>
      {label}
    </Button>
  );
  return reason ? (
    <Hint text={reason}>
      <span tabIndex={0} className="inline-flex">
        {btn}
      </span>
    </Hint>
  ) : (
    btn
  );
}

function UserDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { user: me } = useSession();
  const { toast } = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, mutate } = useSWR<DetailResponse>(id ? `/api/admin/users/${id}` : null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [busy, setBusy] = React.useState(false);
  const u = data?.user.id === id ? data.user : undefined;

  const refreshAll = async () => {
    await Promise.all([mutate(), globalMutate((k) => typeof k === "string" && (k.startsWith("/api/admin/users?") || k.startsWith("/api/admin/audit") || k === "/api/admin/overview"))]);
  };

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: label, variant: "success" });
      setPending(null);
      after?.();
      await refreshAll();
    } catch (err) {
      toast({ title: "Não foi possível concluir", description: (err as Error).message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const act = (body: Record<string, unknown>, label: string) => run(label, () => postJson(`/api/admin/users/${id}/actions`, body));

  const blocked = (a: AdminAction) => (u && me ? actionBlockedReason(a, { id: u.id, role: u.role, isOwner: u.isOwner }, me.id) : null);

  const button = (a: AdminAction, label: string, variant: "outline" | "danger" = "outline") => <ActionButton reason={blocked(a)} onClick={() => setPending(a)} label={label} variant={variant} />;

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-xl translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-r-0 p-4 sm:p-5">
        <DialogHeader className="pr-6">
          <DialogTitle>Detalhes do usuário</DialogTitle>
          <DialogDescription className="sr-only">Acesso, ações, uso e histórico da conta</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="danger">{(error as Error).message}</Alert> : null}
        {!u && !error ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}
        {u && data ? (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar u={u} className="h-11 w-11 text-[13px]" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                  <span className="truncate">{u.name}</span>
                  <TelegramMark on={u.telegramConnected} />
                </div>
                <div className="truncate text-[12.5px] text-muted-foreground">{u.email}</div>
                <div className="mt-1">
                  <AccessBadges u={u} />
                </div>
              </div>
            </div>
            {u.blockedAt ? (
              <Alert variant="danger" title={`Bloqueado em ${formatDateTime(u.blockedAt)}`}>
                {u.blockedReason ? `Motivo: ${u.blockedReason}` : "Sem motivo informado."}
              </Alert>
            ) : null}

            <Section title="Acesso">
              <Field k="Acesso atual" v={TIER_LABEL_ADMIN[u.tier]} />
              <Field k="Situação" v={u.subscription ? (SUB_STATUS_LABEL[u.subscription.status] ?? u.subscription.status) : STATUS_LABEL_ADMIN[u.status]} />
              <Field k="Origem" v={providerLabel(u)} />
              <Field k="Validade" v={validityLabel(u.tier, u.subscription)} />
              <Field k="Entra com" v={u.loginMethod === "google" ? "Google" : "E-mail e senha"} />
              <Field k="Cadastro" v={formatDateTime(u.createdAt)} />
              <Field k="Último acesso" v={u.lastAccessAt ? `${formatDateTime(u.lastAccessAt)} (${timeAgo(u.lastAccessAt)})` : "—"} />
            </Section>

            <Section title="Ações rápidas">
              <div className="flex flex-wrap gap-2">
                {button("grant", "Liberar acesso")}
                {button("extend_trial", "Estender teste")}
                {button("revoke", "Encerrar acesso")}
                {button("end_sessions", "Encerrar sessões")}
                {button("password_reset", "Enviar link de nova senha")}
                {u.blockedAt ? button("unblock", "Desbloquear") : button("block", "Bloquear")}
                {button("delete", "Excluir conta", "danger")}
              </div>
              {blocked("grant") ? <p className="text-[12px] text-muted-foreground">{blocked("grant")}</p> : null}
            </Section>

            <Section title="Uso">
              <div className="grid grid-cols-4 gap-2 text-center">
                {(
                  [
                    ["Agentes", u.counts.agents],
                    ["Monitores", u.counts.monitors],
                    ["Alertas", u.counts.alerts],
                    ["Estratégias", u.counts.strategies],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border p-2">
                    <div className="tabular text-lg font-semibold">{v}</div>
                    <div className="text-[11px] text-muted-foreground">{k}</div>
                  </div>
                ))}
              </div>
              {data.preference ? (
                <p className="text-[12px] text-muted-foreground">
                  Preferências: tema {data.preference.theme === "dark" ? "escuro" : data.preference.theme === "light" ? "claro" : "do sistema"} · moeda {data.preference.currency} · tempo gráfico {data.preference.defaultTimeframe} · {data.preference.lessonsDone} {data.preference.lessonsDone === 1 ? "lição concluída" : "lições concluídas"}
                  {u.telegramConnected ? " · Telegram conectado" : ""}
                </p>
              ) : null}
              {data.events.length ? (
                <div className="text-[12px] text-muted-foreground">
                  Atividade recente:{" "}
                  {data.events.map((e, i) => (
                    <span key={i}>
                      {i ? " · " : ""}
                      {EVENT_LABEL[e.name] ?? e.name} ({timeAgo(e.createdAt)})
                    </span>
                  ))}
                </div>
              ) : null}
            </Section>

            <Section title="Compras na Kiwify">
              {data.grants.length === 0 ? <p className="text-[12.5px] text-muted-foreground">Nenhuma compra com este e-mail.</p> : null}
              {data.grants.map((g) => (
                <div key={g.provider + g.externalId} className="rounded-md border border-border p-2 text-[12.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {g.plan} · {GRANT_STATUS_LABEL[g.status] ?? g.status}
                    </span>
                    <span className="text-muted-foreground">{g.currentPeriodEnd ? `até ${fmtDay(g.currentPeriodEnd)}` : "sem data de renovação"}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">
                    Compra em {fmtDay(g.createdAt)} · último evento {g.lastEvent} em {fmtDay(g.updatedAt)}
                    {g.lastOrderId ? ` · pedido ${g.lastOrderId}` : ""}
                    {g.appliedAt ? "" : " · ainda não aplicada à conta"}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Acessos recentes">
              {data.accessLogs.length === 0 ? <p className="text-[12.5px] text-muted-foreground">Nenhum acesso registrado nos últimos 6 meses.</p> : null}
              <ul className="flex flex-col gap-0.5">
                {data.accessLogs.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2 text-[12.5px]">
                    <span>{ACCESS_EVENT_LABEL[a.event] ?? a.event}</span>
                    <span className="tabular text-muted-foreground">
                      {a.ip} · {formatDateTime(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Histórico de ações do admin">
              {data.audit.length === 0 ? <p className="text-[12.5px] text-muted-foreground">Nenhuma ação registrada para esta conta.</p> : null}
              <ul className="flex flex-col gap-1.5">
                {data.audit.map((a) => (
                  <li key={a.id} className="text-[12.5px]">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                      <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      por {a.adminEmail}
                      {describeAudit(a) ? ` · ${describeAudit(a)}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        ) : null}
        {u ? <ActionDialogs key={pending ?? "none"} u={u} pending={pending} busy={busy} onCancel={() => setPending(null)} act={act} run={run} onDeleted={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Confirmações das ações
// ------------------------------------------------------------------

const GRANT_DAYS: Array<{ v: string; label: string }> = [
  { v: "7", label: "7 dias" },
  { v: "30", label: "30 dias" },
  { v: "90", label: "90 dias" },
  { v: "365", label: "1 ano" },
  { v: "none", label: "Sem prazo" },
];

function ActionDialogs({
  u,
  pending,
  busy,
  onCancel,
  act,
  run,
  onDeleted,
}: {
  u: UserRow;
  pending: Pending;
  busy: boolean;
  onCancel: () => void;
  act: (body: Record<string, unknown>, label: string) => Promise<void>;
  run: (label: string, fn: () => Promise<unknown>, after?: () => void) => Promise<void>;
  onDeleted: () => void;
}) {
  const [plan, setPlan] = React.useState<"PRO" | "ELITE">("PRO");
  const [days, setDays] = React.useState("30");
  const [trialDays, setTrialDays] = React.useState(7);
  const [reason, setReason] = React.useState("");
  const [confirmEmail, setConfirmEmail] = React.useState("");

  const hasPaid = u.tier === "PRO" || u.tier === "ELITE";
  const kiwify = u.subscription?.provider === "kiwify";
  let title = "";
  let body: React.ReactNode = null;
  let confirm: React.ReactNode = null;

  switch (pending) {
    case "grant":
      title = "Liberar acesso";
      body = (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Plano</Label>
            <div className="flex gap-2">
              {(["PRO", "ELITE"] as const).map((p) => (
                <Button key={p} size="sm" variant={plan === p ? "default" : "outline"} onClick={() => setPlan(p)} aria-pressed={plan === p}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prazo</Label>
            <div className="flex flex-wrap gap-2">
              {GRANT_DAYS.map((d) => (
                <Button key={d.v} size="sm" variant={days === d.v ? "default" : "outline"} onClick={() => setDays(d.v)} aria-pressed={days === d.v}>
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {days === "none" ? "O acesso fica liberado até você encerrar." : "Se já houver um período ativo, os dias são somados ao que ainda resta."}
            {kiwify ? " Esta conta tem assinatura na Kiwify: a próxima cobrança ou cancelamento na Kiwify volta a valer por cima desta liberação." : ""}
          </p>
        </div>
      );
      confirm = (
        <Button loading={busy} onClick={() => act({ action: "grant", plan, days: days === "none" ? null : Number(days) }, `Acesso ${plan} liberado`)}>
          Liberar {plan}
        </Button>
      );
      break;
    case "extend_trial":
      title = "Estender teste";
      body = hasPaid ? (
        <Alert variant="warning">Esta conta já tem plano ativo. Para mudar o prazo, use Liberar acesso.</Alert>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {[3, 7, 14].map((d) => (
              <Button key={d} size="sm" variant={trialDays === d ? "default" : "outline"} onClick={() => setTrialDays(d)} aria-pressed={trialDays === d}>
                +{d} dias
              </Button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted-foreground">O teste grátis do PRO continua a partir do dia em que terminaria (ou a partir de hoje, se já terminou).</p>
        </div>
      );
      confirm = hasPaid ? null : (
        <Button loading={busy} onClick={() => act({ action: "extend_trial", days: trialDays }, `Teste estendido em ${trialDays} dias`)}>
          Estender
        </Button>
      );
      break;
    case "revoke":
      title = "Encerrar acesso";
      body = (
        <p className="text-sm text-muted-foreground">
          O usuário perde o acesso às ferramentas agora. A conta, os agentes e o histórico continuam guardados.
          {kiwify ? " A assinatura na Kiwify não é cancelada por aqui: se houver nova cobrança, o acesso volta." : ""}
        </p>
      );
      confirm = (
        <Button variant="danger" loading={busy} onClick={() => act({ action: "revoke" }, "Acesso encerrado")}>
          Encerrar acesso
        </Button>
      );
      break;
    case "end_sessions":
      title = "Encerrar sessões";
      body = <p className="text-sm text-muted-foreground">O usuário sai de todos os aparelhos e precisa entrar de novo.</p>;
      confirm = (
        <Button loading={busy} onClick={() => act({ action: "end_sessions" }, "Sessões encerradas")}>
          Encerrar sessões
        </Button>
      );
      break;
    case "password_reset":
      title = "Enviar link de nova senha";
      body = <p className="text-sm text-muted-foreground">Enviamos para {u.email} um link para criar uma nova senha. O link vale por 60 minutos.</p>;
      confirm = (
        <Button
          loading={busy}
          onClick={() =>
            run("Link enviado", async () => {
              const r = await postJson<{ emailEnabled: boolean }>(`/api/admin/users/${u.id}/actions`, { action: "password_reset" });
              if (!r.emailEnabled) throw new Error("O envio de e-mails não está configurado. O link foi criado, mas não foi enviado.");
            })
          }
        >
          Enviar link
        </Button>
      );
      break;
    case "block":
      title = "Bloquear conta";
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">O usuário sai de todos os aparelhos e não consegue entrar até ser desbloqueado. Os dados continuam guardados.</p>
          <Label htmlFor="block-reason">Motivo (só você vê)</Label>
          <Textarea id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ex.: pagamento contestado" />
        </div>
      );
      confirm = (
        <Button variant="danger" loading={busy} onClick={() => act({ action: "block", reason }, "Conta bloqueada")}>
          Bloquear
        </Button>
      );
      break;
    case "unblock":
      title = "Desbloquear conta";
      body = <p className="text-sm text-muted-foreground">O usuário volta a conseguir entrar. O acesso às ferramentas segue o plano atual.</p>;
      confirm = (
        <Button loading={busy} onClick={() => act({ action: "unblock" }, "Conta desbloqueada")}>
          Desbloquear
        </Button>
      );
      break;
    case "delete": {
      const matches = confirmEmail.trim().toLowerCase() === u.email.toLowerCase();
      title = "Excluir conta";
      body = (
        <div className="flex flex-col gap-2">
          <Alert variant="danger" title="Esta ação é permanente">
            Apaga a conta e tudo o que ela criou: agentes, monitores, alertas, estratégias, carteira e histórico. Não é possível desfazer.
          </Alert>
          <Label htmlFor="confirm-email">Digite o e-mail da conta para confirmar</Label>
          <Input id="confirm-email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={u.email} autoComplete="off" />
        </div>
      );
      confirm = (
        <Button variant="danger" disabled={!matches} loading={busy} onClick={() => run("Conta excluída", () => apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE", body: JSON.stringify({ confirmEmail }) }), onDeleted)}>
          Excluir definitivamente
        </Button>
      );
      break;
    }
    default:
      break;
  }

  return (
    <Dialog open={pending != null} onOpenChange={(o) => (!o && !busy ? onCancel() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {u.name} · {u.email}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          {confirm}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
