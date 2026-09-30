import { beforeEach, describe, expect, it, vi } from "vitest";

// checkLink: banco e Bot API simulados; o cache é o de memória (sem REDIS_URL nos testes).
const mocks = vi.hoisted(() => ({ userUpdate: vi.fn(), getUpdates: vi.fn(), send: vi.fn() }));
vi.mock("@/database/client", () => ({ requirePrisma: () => ({ user: { update: mocks.userUpdate } }) }));
vi.mock("@/services/telegram", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/telegram")>()), getTelegramUpdates: mocks.getUpdates, sendTelegramMessage: mocks.send }));

import { getCache } from "@/lib/cache";
import { checkLink, completeLink, computeAckOffset, createLinkCode, extractStartCode, generateLinkCode, pickMatches, telegramDeepLink } from "@/services/telegram-link";
import { telegramErrorMessage, type TelegramUpdate } from "@/services/telegram";

const CODE_A = "AbCdEfGhIjKlMnOpQrStUv12";
const CODE_B = "ZyXwVuTsRqPoNmLkJiHg-_98";

function upd(id: number, text: string | undefined, chatId = 1000 + id, type = "private"): TelegramUpdate {
  return { update_id: id, message: { message_id: id, text, chat: { id: chatId, type } } };
}

describe("Telegram link — extractStartCode", () => {
  it("lê o código de /start e /start@Bot", () => {
    expect(extractStartCode(`/start ${CODE_A}`)).toBe(CODE_A);
    expect(extractStartCode(`  /start@CryptoScannerAlertasBot ${CODE_B}  `)).toBe(CODE_B);
  });
  it("recusa /start sem código, código curto, com caracteres inválidos ou texto qualquer", () => {
    expect(extractStartCode("/start")).toBeNull();
    expect(extractStartCode("/start abc")).toBeNull();
    expect(extractStartCode(`/start ${CODE_A}!`)).toBeNull();
    expect(extractStartCode(`/start ${CODE_A} extra`)).toBeNull();
    expect(extractStartCode(`olá ${CODE_A}`)).toBeNull();
    expect(extractStartCode(undefined)).toBeNull();
    expect(extractStartCode(null)).toBeNull();
  });
  it("códigos gerados são URL-safe, com 24 caracteres e aceitos pelo parser", () => {
    const c = generateLinkCode();
    expect(c).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(extractStartCode(`/start ${c}`)).toBe(c);
    expect(generateLinkCode()).not.toBe(c);
    expect(telegramDeepLink(c)).toBe(`https://t.me/CryptoScannerAlertasBot?start=${c}`);
  });
});

describe("Telegram link — pickMatches", () => {
  const pending = new Map([
    [CODE_A, "user-a"],
    [CODE_B, "user-b"],
  ]);
  it("casa só códigos pendentes em chats privados, com o chat id como string", () => {
    const updates = [upd(10, "oi"), upd(11, `/start ${CODE_A}`, -555, "group"), upd(12, `/start ${CODE_A}`, 42), upd(13, `/start ${"x".repeat(20)}`), upd(14, `/start ${CODE_B}`, 77)];
    expect(pickMatches(updates, pending)).toEqual([
      { updateId: 12, code: CODE_A, userId: "user-a", chatId: "42" },
      { updateId: 14, code: CODE_B, userId: "user-b", chatId: "77" },
    ]);
  });
  it("mesmo código repetido gera um único vínculo (primeira ocorrência), independente da ordem recebida", () => {
    const updates = [upd(21, `/start ${CODE_A}`, 9), upd(20, `/start ${CODE_A}`, 8)];
    expect(pickMatches(updates, pending)).toEqual([{ updateId: 20, code: CODE_A, userId: "user-a", chatId: "8" }]);
  });
  it("ignora atualizações sem mensagem", () => {
    expect(pickMatches([{ update_id: 1 }], pending)).toEqual([]);
  });
});

describe("Telegram link — computeAckOffset", () => {
  const updates = [upd(5, "a"), upd(3, "b"), upd(4, "c"), upd(6, "d")];
  it("sem bloqueios, confirma tudo (maior update_id + 1)", () => {
    expect(computeAckOffset(updates, new Set())).toBe(7);
  });
  it("para antes da primeira atualização bloqueada", () => {
    expect(computeAckOffset(updates, new Set([5]))).toBe(5);
    expect(computeAckOffset(updates, new Set([3]))).toBeNull();
  });
  it("lista vazia não confirma nada", () => {
    expect(computeAckOffset([], new Set())).toBeNull();
  });
});

describe("Telegram — telegramErrorMessage", () => {
  it("remove o token do bot de mensagens de erro", () => {
    expect(telegramErrorMessage(new Error("falha em https://api.telegram.org/bot123456:AA-bb_CC/getUpdates"))).toBe("falha em https://api.telegram.org/bot<token>/getUpdates");
  });
});

describe("Telegram link — conclusão e confirmação (offset)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ ok: true });
    mocks.userUpdate.mockResolvedValue({});
  });
  const ackCalls = () => mocks.getUpdates.mock.calls.filter((c) => c[0]?.offset !== undefined).map((c) => c[0].offset);

  it("completeLink: done na primeira vez, claimed_elsewhere se outra verificação já reivindicou, failed se o banco falhar", async () => {
    const a = await createLinkCode("user-1");
    expect(await completeLink({ updateId: 1, code: a.code, userId: "user-1", chatId: "10" })).toBe("done");
    expect(await completeLink({ updateId: 1, code: a.code, userId: "user-1", chatId: "10" })).toBe("claimed_elsewhere");
    const b = await createLinkCode("user-2");
    mocks.userUpdate.mockRejectedValueOnce(new Error("banco fora"));
    expect(await completeLink({ updateId: 2, code: b.code, userId: "user-2", chatId: "20" })).toBe("failed");
    // a falha libera a reivindicação: a próxima verificação tenta de novo
    expect(await completeLink({ updateId: 2, code: b.code, userId: "user-2", chatId: "20" })).toBe("done");
  });

  it("código reivindicado por outra verificação em andamento não é confirmado ao Telegram", async () => {
    const { code } = await createLinkCode("user-3");
    await getCache().incr(`tglink:claim:${code}`, 120); // outra verificação está concluindo este código
    mocks.getUpdates.mockResolvedValueOnce([upd(30, "oi"), upd(31, `/start ${code}`, 99), upd(32, "tchau")]);
    mocks.getUpdates.mockResolvedValue([]);
    expect(await checkLink("user-3")).toEqual({ connected: false });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(ackCalls()).toEqual([31]);
  });

  it("conexão concluída (e códigos desconhecidos) avançam o offset", async () => {
    const { code } = await createLinkCode("user-4");
    mocks.getUpdates.mockResolvedValueOnce([upd(40, `/start ${code}`, 55), upd(41, `/start ${"Q".repeat(24)}`)]);
    mocks.getUpdates.mockResolvedValue([]);
    expect(await checkLink("user-4")).toEqual({ connected: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: "user-4" }, data: { telegramChatId: "55" } });
    expect(ackCalls()).toEqual([42]);
  });

  it("falha ao gravar não confirma a atualização", async () => {
    const { code } = await createLinkCode("user-5");
    mocks.userUpdate.mockRejectedValueOnce(new Error("banco fora"));
    mocks.getUpdates.mockResolvedValueOnce([upd(50, `/start ${code}`, 66)]);
    mocks.getUpdates.mockResolvedValue([]);
    expect(await checkLink("user-5")).toEqual({ connected: false });
    expect(ackCalls()).toEqual([]);
  });
});
