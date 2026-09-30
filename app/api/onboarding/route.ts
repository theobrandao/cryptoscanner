import { connection } from "next/server";
import { ok, requireUser, withApi } from "@/lib/api";
import { requirePrisma } from "@/database/client";

type OnboardingStepKey = "conta" | "sinais" | "favorito" | "agente" | "alerta" | "aula";

/**
 * Primeiros passos da tela Início, na ordem de valor (fonte única dos rótulos e da ordem).
 * `done` vem do que a conta já fez no servidor; o painel ainda soma o que só existe no aparelho
 * (favoritos e aulas salvos no navegador, seção de sinais vista agora).
 * `dismissed`: lista ocultada ou concluída (User.onboardedAt), vale em todos os aparelhos.
 */
export const GET = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  const prisma = requirePrisma();
  const [u, signals, favorites, agents, monitors, alerts, pref] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } }),
    prisma.analyticsEvent.count({ where: { userId: user.id, name: "onboarding_step", props: { path: ["step"], equals: "sinais" } } }),
    prisma.watchlistItem.count({ where: { watchlist: { userId: user.id } } }),
    prisma.agent.count({ where: { userId: user.id } }),
    prisma.monitor.count({ where: { userId: user.id, active: true } }),
    prisma.alert.count({ where: { userId: user.id, active: true } }),
    prisma.userPreference.findUnique({ where: { userId: user.id }, select: { learning: true } }),
  ]);
  const learning = (pref?.learning as Record<string, { done?: boolean }> | null) ?? {};
  const lessonDone = Object.values(learning).some((l) => Boolean(l?.done));
  const steps: Array<{ key: OnboardingStepKey; label: string; href: string; done: boolean }> = [
    { key: "conta", label: "Conta criada", href: "/", done: true },
    { key: "sinais", label: "Ver os sinais do modelo", href: "/#sinais", done: signals > 0 },
    { key: "favorito", label: "Favoritar um ativo", href: "/scanner", done: favorites > 0 },
    { key: "agente", label: "Criar um agente", href: "/agentes", done: agents > 0 },
    { key: "alerta", label: "Ativar um alerta ou monitor", href: "/monitor", done: monitors + alerts > 0 },
    { key: "aula", label: "Concluir 1 aula da Jornada", href: "/jornada", done: lessonDone },
  ];
  return ok({ dismissed: Boolean(u?.onboardedAt), steps, done: steps.filter((s) => s.done).length });
});

/** Oculta a lista de primeiros passos nesta conta (vale em todos os aparelhos). */
export const POST = withApi(async (req) => {
  await connection();
  const user = await requireUser(req);
  await requirePrisma().user.updateMany({ where: { id: user.id, onboardedAt: null }, data: { onboardedAt: new Date() } });
  return ok({ dismissed: true });
});
