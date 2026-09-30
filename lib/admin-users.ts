/**
 * Regras puras do Painel de controle (usuários): filtros por acesso/situação, rótulos, travas de ação e CSV.
 * Usado pelo serviço (servidor) e pela tela (cliente) — sem acesso a banco ou ambiente.
 */
import { effectiveStatus, tierFor, type SubscriptionLike, type Tier } from "@/lib/entitlements";

export const ADMIN_TIERS = ["TRIAL", "PRO", "ELITE", "NONE", "ADMIN"] as const;
export const ADMIN_STATUSES = ["ativo", "teste", "expirado", "bloqueado", "inadimplente"] as const;
export const ADMIN_SORTS = ["recentes", "ultimo_acesso", "nome"] as const;
export const ADMIN_ACTIONS = ["grant", "extend_trial", "revoke", "block", "unblock", "end_sessions", "password_reset", "delete"] as const;

export type AdminStatus = (typeof ADMIN_STATUSES)[number];
export type AdminSort = (typeof ADMIN_SORTS)[number];
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const TIER_LABEL_ADMIN: Record<Tier, string> = { TRIAL: "Teste grátis", PRO: "PRO", ELITE: "ELITE", NONE: "Sem acesso", ADMIN: "Administrador" };
export const STATUS_LABEL_ADMIN: Record<AdminStatus, string> = { ativo: "Ativo", teste: "Em teste", expirado: "Expirado", bloqueado: "Bloqueado", inadimplente: "Pagamento pendente" };
export const ACTION_LABEL: Record<string, string> = {
  grant: "Liberou acesso",
  extend_trial: "Estendeu o teste",
  revoke: "Encerrou o acesso",
  block: "Bloqueou a conta",
  unblock: "Desbloqueou a conta",
  end_sessions: "Encerrou as sessões",
  password_reset: "Enviou link de nova senha",
  delete: "Excluiu a conta",
};
export const PROVIDER_LABEL: Record<string, string> = { kiwify: "Kiwify", mercadopago: "Mercado Pago", manual: "manual" };

/** Acesso (tier) e situação de uma conta, como o painel mostra. */
export function classifyUser(u: { role: string; blockedAt: Date | string | null; subscription: SubscriptionLike | null }, now = new Date()): { tier: Tier; status: AdminStatus; effective: string | null } {
  const tier = tierFor(u.subscription, u.role, now);
  const effective = u.subscription ? effectiveStatus(u.subscription, now) : null;
  let status: AdminStatus;
  if (u.blockedAt) status = "bloqueado";
  else if (effective === "PAST_DUE") status = "inadimplente";
  else if (tier === "TRIAL") status = "teste";
  else if (tier === "NONE") status = "expirado";
  else status = "ativo";
  return { tier, status, effective };
}

/** Filtro da lista: acesso (tier) e situação; ausente = não filtra. */
export function matchesFilter(row: { tier: Tier; status: AdminStatus }, filter: { tier?: Tier; status?: AdminStatus }): boolean {
  if (filter.tier && row.tier !== filter.tier) return false;
  if (filter.status && row.status !== filter.status) return false;
  return true;
}

/**
 * Trava de ação: contas de administrador/dono não recebem ações; o próprio admin não bloqueia, exclui nem encerra o
 * próprio acesso. Retorna o motivo (texto para a tela) ou null quando a ação é permitida.
 */
export function actionBlockedReason(action: AdminAction, target: { id: string; role: string; isOwner: boolean }, actorId: string): string | null {
  if (target.id === actorId && (action === "block" || action === "delete" || action === "revoke")) return "Você não pode fazer isso na sua própria conta.";
  if (target.role === "ADMIN" || target.isOwner) return "Contas de administrador não podem ser alteradas por aqui.";
  return null;
}

/** Fim do novo período ao liberar acesso: soma os dias ao que ainda resta (nunca antes de agora). null = sem prazo. */
export function grantPeriodEnd(days: number | null, existing: { status: string; currentPeriodEnd: Date | null } | null, now = new Date()): Date | null {
  if (days == null) return null;
  const base = existing && existing.status === "ACTIVE" && existing.currentPeriodEnd && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
  return new Date(base.getTime() + days * 86_400_000);
}

/** Novo fim do teste: soma os dias ao que resta do teste (ou a partir de agora). */
export function extendedTrialEnd(days: number, trialEndsAt: Date | null, now = new Date()): Date {
  const base = trialEndsAt && trialEndsAt > now ? trialEndsAt : now;
  return new Date(base.getTime() + days * 86_400_000);
}

const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const dmy = (d: Date) => `${dm(d)}/${d.getFullYear()}`;

/** Validade como texto curto: "teste até 03/10", "até 30/10/2026", "sem prazo", "encerrado em ...". */
export function validityLabel(tier: Tier, sub: { status: string; trialEndsAt: string | Date | null; currentPeriodEnd: string | Date | null } | null): string {
  if (tier === "ADMIN") return "sem prazo";
  if (!sub) return "—";
  const trial = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  if (tier === "TRIAL") return trial ? `teste até ${dm(trial)}` : "teste";
  if (tier === "PRO" || tier === "ELITE") return end ? `até ${dmy(end)}` : "sem prazo";
  const last = end ?? trial;
  return last ? `encerrado em ${dmy(last)}` : "—";
}

/** Uma célula de CSV (separador ";"): aspas quando preciso e proteção contra fórmula no Excel. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV para Excel pt-BR: BOM UTF-8, ";" como separador, CRLF entre linhas. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Iniciais para o avatar (até 2 letras). */
export function initials(name: string, email: string): string {
  const parts = (name || email).trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? (parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "") : (parts[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}
