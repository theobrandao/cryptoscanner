import { connection } from "next/server";
import { ok, requireUser, withApi } from "@/lib/api";
import { requirePrisma } from "@/database/client";

/** Checklist do primeiro uso, derivado do que a conta já fez (sem marcação manual). */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = requirePrisma();
  const [u, wl, mon, strat, bt, ctxChange, analyst] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } }),
    prisma.watchlistItem.count({ where: { watchlist: { userId: user.id } } }),
    prisma.monitor.count({ where: { userId: user.id } }),
    prisma.strategy.count({ where: { userId: user.id } }),
    prisma.analyticsEvent.count({ where: { userId: user.id, name: "backtest_run" } }),
    prisma.analyticsEvent.count({ where: { userId: user.id, name: "context_change" } }),
    prisma.analyticsEvent.count({ where: { userId: user.id, name: "analyst_open" } }),
  ]);
  const steps = [
    { key: "context", label: "Troque exchange, instrumento ou timeframe no Dashboard", done: ctxChange > 0, href: "/" },
    { key: "watchlist", label: "Adicione um ativo à watchlist (estrela no cabeçalho)", done: wl > 0, href: "/" },
    { key: "monitor", label: "Crie um monitor (botão Monitor no cabeçalho)", done: mon > 0, href: "/monitor" },
    { key: "strategy", label: "Salve uma estratégia a partir de um modelo", done: strat > 0, href: "/strategies" },
    { key: "backtest", label: "Rode um backtest com custos", done: bt > 0, href: "/backtest" },
    { key: "analyst", label: "Abra o AI Analyst no contexto atual", done: analyst > 0, href: "/" },
  ];
  return ok({ dismissed: Boolean(u?.onboardedAt), steps, done: steps.filter((s) => s.done).length });
});

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await requirePrisma().user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  return ok({ dismissed: true });
});
