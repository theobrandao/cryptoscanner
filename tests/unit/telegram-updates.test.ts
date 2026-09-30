import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { getTelegramUpdates, TelegramBusyError, TelegramWebhookConflictError } from "@/services/telegram";

const saved = process.env.TELEGRAM_BOT_TOKEN;
beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123456:token-de-teste";
  resetEnvCache();
});
afterEach(() => {
  if (saved === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = saved;
  resetEnvCache();
  vi.restoreAllMocks();
});

const reply = (status: number, body: object) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("Telegram — getUpdates e o HTTP 409", () => {
  it("409 por webhook configurado → TelegramWebhookConflictError", async () => {
    reply(409, { ok: false, error_code: 409, description: "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first" });
    await expect(getTelegramUpdates()).rejects.toBeInstanceOf(TelegramWebhookConflictError);
  });
  it("409 por outra leitura simultânea → TelegramBusyError (transitório), não webhook", async () => {
    reply(409, { ok: false, error_code: 409, description: "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running" });
    const err = await getTelegramUpdates().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramBusyError);
    expect(err).not.toBeInstanceOf(TelegramWebhookConflictError);
  });
  it("409 sem descrição legível também é tratado como transitório", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 409 }));
    await expect(getTelegramUpdates()).rejects.toBeInstanceOf(TelegramBusyError);
  });
  it("sucesso devolve as atualizações; outros erros não expõem o token", async () => {
    reply(200, { ok: true, result: [{ update_id: 7 }] });
    await expect(getTelegramUpdates()).resolves.toEqual([{ update_id: 7 }]);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("falhou https://api.telegram.org/bot123456:token-de-teste/getUpdates"));
    const err = (await getTelegramUpdates().catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain("token-de-teste");
  });
});
