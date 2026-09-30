import { beforeEach, describe, expect, it, vi } from "vitest";

// e-mail "configurado" só para capturar o conteúdo; nada sai (fetchJson mockado)
process.env.RESEND_API_KEY = "re_teste";
process.env.EMAIL_FROM = "CryptoScanner <avisos@example.com>";

const h = vi.hoisted(() => ({
  emails: [] as Array<{ subject: string; text: string }>,
  pushes: [] as Array<{ userId: string; title: string; body: string; tag: string }>,
  findMany: vi.fn(),
  update: vi.fn(async () => ({})),
  monitorUpdateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/http", () => ({
  fetchJson: vi.fn(async (_url: string, init: { body: string }) => {
    const b = JSON.parse(init.body) as { subject: string; text: string };
    h.emails.push({ subject: b.subject, text: b.text });
    return { id: "email-1" };
  }),
}));
vi.mock("@/services/push-service", () => ({
  sendPushToUser: vi.fn(async (userId: string, p: { title: string; body: string; tag: string }) => {
    h.pushes.push({ userId, title: p.title, body: p.body, tag: p.tag });
  }),
}));
vi.mock("@/services/access-log-service", () => ({ purgeAccessLogs: vi.fn(async () => 0) }));
vi.mock("@/database/client", () => ({
  getPrisma: () => ({ subscription: { findMany: h.findMany, update: h.update }, monitor: { updateMany: h.monitorUpdateMany } }),
}));

const { lifecycleWhere, noticePush, runLifecycle, trialNoticeKind, TRIAL_NOTICE_WINDOW_HOURS } = await import("@/services/lifecycle-service");
const { releaseCronLock } = await import("@/lib/cron");
const { sendTemplate } = await import("@/services/email-service");

const NOW = new Date("2026-10-01T15:00:00Z");
const H = 3600_000;
const trial = (hoursLeft: number, lastNoticeKind: string | null = null) => ({
  plan: "PRO",
  status: "TRIALING",
  trialStartedAt: new Date(NOW.getTime() - (72 - hoursLeft) * H),
  trialEndsAt: new Date(NOW.getTime() + hoursLeft * H),
  currentPeriodEnd: null,
  providerSubscriptionId: null,
  lastNoticeKind,
});

beforeEach(async () => {
  h.emails.length = 0;
  h.pushes.length = 0;
  h.findMany.mockReset();
  h.update.mockClear();
  h.monitorUpdateMany.mockClear();
  await releaseCronLock("lifecycle");
});

describe("momento dos avisos do teste (3 dias)", () => {
  it("nada sai com 48 h ou 25 h restantes (o primeiro aviso é na véspera)", () => {
    expect(trialNoticeKind(trial(48), NOW)).toBeNull();
    expect(trialNoticeKind(trial(25), NOW)).toBeNull();
    expect(trialNoticeKind(trial(71), NOW)).toBeNull();
  });
  it("véspera: entre 24 h e 6 h antes do fim sai trial_ending, uma vez", () => {
    expect(TRIAL_NOTICE_WINDOW_HOURS).toEqual({ ending: 24, lastDay: 6 });
    expect(trialNoticeKind(trial(24), NOW)).toBe("trial_ending");
    expect(trialNoticeKind(trial(7), NOW)).toBe("trial_ending");
    expect(trialNoticeKind(trial(20, "trial_ending"), NOW)).toBeNull();
  });
  it("últimas 6 h: trial_last_day, mesmo sem o aviso da véspera, e só uma vez", () => {
    expect(trialNoticeKind(trial(6, "trial_ending"), NOW)).toBe("trial_last_day");
    expect(trialNoticeKind(trial(1), NOW)).toBe("trial_last_day");
    expect(trialNoticeKind(trial(2, "trial_last_day"), NOW)).toBeNull();
  });
  it("teste vencido: trial_ended uma vez; compra pela Kiwify não recebe", () => {
    expect(trialNoticeKind(trial(-1, "trial_last_day"), NOW)).toBe("trial_ended");
    expect(trialNoticeKind(trial(-1, null), NOW)).toBe("trial_ended");
    expect(trialNoticeKind(trial(-1, "trial_ended"), NOW)).toBeNull();
    expect(trialNoticeKind({ ...trial(-1), status: "EXPIRED", providerSubscriptionId: "k1" }, NOW)).toBeNull();
  });
});

describe("filtro do lote", () => {
  it("inclui contas sem aviso anterior (lastNoticeKind NULL) em todos os grupos de aviso", () => {
    const w = lifecycleWhere(NOW);
    const groups = w.OR as Array<Record<string, unknown>>;
    expect(groups).toHaveLength(3);
    for (const g of groups.slice(0, 2)) expect(g.OR).toEqual([{ lastNoticeKind: null }, { lastNoticeKind: { not: "trial_ended" } }]);
    expect(groups[0]).toMatchObject({ status: "TRIALING", trialEndsAt: { lte: new Date(NOW.getTime() + 24 * H) } });
    expect(groups[2]).toMatchObject({ user: { monitors: { some: { active: true } } } });
  });

  it("consulta em ordem de fim do teste e envia um aviso por conta, com textos diferentes", async () => {
    const user = (id: string) => ({ id, email: `${id}@example.com`, name: "Ana Teste", role: "USER" });
    h.findMany.mockResolvedValueOnce([
      { id: "s1", userId: "u1", ...trial(20), user: user("u1") },
      { id: "s2", userId: "u2", ...trial(3, "trial_ending"), user: user("u2") },
      { id: "s3", userId: "u3", ...trial(-2, null), status: "EXPIRED", user: user("u3") },
    ]);
    const out = await runLifecycle(NOW);
    expect(out).toMatchObject({ trialEnding: 1, trialLastDay: 1, trialEnded: 1 });
    const args = h.findMany.mock.calls[0]![0] as { orderBy: unknown; take: number };
    expect(args.orderBy).toEqual({ trialEndsAt: "asc" });
    expect(h.pushes.map((p) => p.tag)).toEqual(["trial_ending", "trial_last_day", "trial_ended"]);
    expect(new Set(h.pushes.map((p) => p.body)).size).toBe(3);
    expect(new Set(h.emails.map((e) => e.subject)).size).toBe(3);
    expect(h.update).toHaveBeenCalledTimes(3);
    expect(h.monitorUpdateMany).toHaveBeenCalledTimes(1); // só a conta sem acesso
  });

  it("no máximo uma execução por hora (trava atômica)", async () => {
    h.findMany.mockResolvedValue([]);
    expect(await runLifecycle(NOW)).not.toEqual({ skipped: true });
    expect(await runLifecycle(NOW)).toEqual({ skipped: true });
  });
});

describe("textos dos avisos", () => {
  it("último aviso fala do direito de desistir em 7 dias com reembolso", async () => {
    await sendTemplate("trial_last_day", { to: "a@example.com", name: "Ana", endsAt: new Date("2026-10-02T17:30:00Z") });
    const e = h.emails.at(-1)!;
    expect(e.text).toMatch(/7 dias/);
    expect(e.text).toMatch(/reembolso|valor integral/);
    expect(e.text).toContain("02/10 às 14:30"); // horário de Brasília
    expect(noticePush("trial_last_day", null).body).toMatch(/7 dias/);
  });
  it("sem termos em inglês: Início e Planos", async () => {
    for (const kind of ["welcome", "trial_ending", "trial_last_day", "trial_ended", "subscription_active"] as const) {
      await sendTemplate(kind, { to: "a@example.com", name: "Ana", plan: "PRO", endsAt: new Date("2026-10-02T17:30:00Z") });
      expect(h.emails.at(-1)!.text).not.toMatch(/Dashboard|Plans & Billing|workspace|watchlist/i);
    }
    expect(h.emails[0]!.text).toContain("Abrir o Início");
    expect(h.emails.at(-1)!.text).toContain("em Planos");
  });
});
