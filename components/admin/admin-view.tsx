"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, X } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Overview {
  generatedAt: number;
  users: { total: number; signups7d: number; signups30d: number };
  subscriptions: { trialing: number; expired: number; activePaid: number; activeManual: number; pro: number; elite: number; pastDue: number; cancelled: number; mrrBrl: number; trialToPaid30d: number | null; trialsStarted30d: number };
  usage: { activeMonitors: number; strategies: number; openTickets: number };
  funnel30d: Record<string, number>;
  recentBilling: Array<{ type: string; resourceId: string | null; processed: boolean; error: string | null; createdAt: string }>;
  recentUsers: Array<{ email: string; createdAt: string; role: string; status: string; plan: string }>;
  readiness: Array<{ key: string; label: string; ok: boolean }>;
  checkoutEnabled: boolean;
}

const FUNNEL = ["signup", "trial_started", "dashboard_view", "context_change", "analyst_open", "monitor_created", "strategy_created", "backtest_run", "plans_view", "checkout_started", "subscription_activated", "payment_failed", "subscription_cancelled"];

function Kpi({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="tabular text-2xl font-bold">{v}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function AdminView() {
  const { user, loading } = useSession();
  const { data, error } = useSWR<Overview>(user?.role === "ADMIN" ? "/api/admin/overview" : null, { refreshInterval: 60_000 });
  if (loading) return <div className="skeleton m-4 h-64 rounded-lg" />;
  if (user?.role !== "ADMIN")
    return (
      <PageShell>
        <Alert variant="danger">Acesso restrito ao administrador.</Alert>
      </PageShell>
    );
  const s = data?.subscriptions;
  return (
    <PageShell className="max-w-[1400px]">
      <PageTitle title="Admin" description="Base de usuários, trials, assinaturas, receita recorrente, funil de 30 dias e itens pendentes para vender." />
      {error ? <Alert variant="danger">{(error as Error).message}</Alert> : null}
      {!data ? <div className="skeleton h-64 rounded-lg" /> : null}
      {data && s ? (
        <div className="flex flex-col gap-4">
          <section className={cn("rounded-lg border p-3", data.checkoutEnabled ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5")}>
            <h2 className="text-[14px] font-semibold">{data.checkoutEnabled ? "Checkout liberado" : "Checkout bloqueado — itens pendentes para vender"}</h2>
            <ul className="mt-2 grid gap-1 text-[12.5px] md:grid-cols-2">
              {data.readiness.map((r) => (
                <li key={r.key} className="flex items-start gap-2">
                  {r.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <span className={r.ok ? "text-muted-foreground" : ""}>{r.label}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Kpi k="Usuários" v={String(data.users.total)} sub={`+${data.users.signups7d} em 7d · +${data.users.signups30d} em 30d`} />
            <Kpi k="Em teste" v={String(s.trialing)} sub={`${s.expired} testes encerrados`} />
            <Kpi k="Pagantes" v={String(s.activePaid)} sub={`PRO ${s.pro} · ELITE ${s.elite}`} />
            <Kpi k="MRR" v={`R$ ${s.mrrBrl.toLocaleString("pt-BR")}`} sub="assinaturas Mercado Pago ativas" />
            <Kpi k="Teste → pago (30d)" v={s.trialToPaid30d != null ? `${(s.trialToPaid30d * 100).toFixed(1)}%` : "—"} sub={`${s.trialsStarted30d} testes iniciados`} />
            <Kpi k="Inadimplentes" v={String(s.pastDue)} sub={`${s.cancelled} cancelados no período`} />
            <Kpi k="Monitores ativos" v={String(data.usage.activeMonitors)} sub={`${data.usage.strategies} estratégias`} />
            <Kpi k="Chamados abertos" v={String(data.usage.openTickets)} sub={`${s.activeManual} acessos manuais`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-lg border border-border bg-card p-3">
              <h2 className="mb-2 text-[13px] font-semibold">Funil (30 dias)</h2>
              {FUNNEL.map((k) => (
                <div key={k} className="flex justify-between py-0.5 text-[12.5px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="tabular">{data.funnel30d[k] ?? 0}</span>
                </div>
              ))}
            </section>
            <section className="rounded-lg border border-border bg-card p-3">
              <h2 className="mb-2 text-[13px] font-semibold">Cadastros recentes</h2>
              {data.recentUsers.map((u) => (
                <div key={u.email + u.createdAt} className="flex justify-between gap-2 py-0.5 text-[12px]">
                  <span className="truncate">{u.email}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {u.role === "ADMIN" ? "admin" : `${u.plan} · ${u.status}`}
                  </span>
                </div>
              ))}
            </section>
            <section className="rounded-lg border border-border bg-card p-3">
              <h2 className="mb-2 text-[13px] font-semibold">Eventos de cobrança</h2>
              {data.recentBilling.length === 0 ? <p className="text-[12px] text-muted-foreground">Nenhum evento.</p> : null}
              {data.recentBilling.map((b, i) => (
                <div key={i} className="py-0.5 text-[12px]">
                  <span className={cn(b.error ? "text-danger" : b.processed ? "" : "text-warning")}>{b.type}</span> <span className="text-muted-foreground">· {formatDateTime(b.createdAt)}</span>
                  {b.error ? <div className="truncate text-[11px] text-danger">{b.error}</div> : null}
                </div>
              ))}
            </section>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Operação: <Link href="/status" className="underline">System Status</Link> · chamados em Help &amp; Support.
          </p>
        </div>
      ) : null}
    </PageShell>
  );
}
