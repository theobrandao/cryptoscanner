import { connection } from "next/server";
import { requirePrisma } from "@/database/client";
import { ApiError, ok, withApi } from "@/lib/api";
import { isTelegramConfigured } from "@/lib/env";
import { getBotUsername, sendTelegramMessage } from "@/services/telegram";
import { requireCoreUser } from "@/services/subscription-service";

/** Envia mensagem de teste para o Chat ID do usuário. GET devolve o nome do bot (para o deep link). */
export const GET = withApi(async () => {
  await connection();
  return ok({
    configured: isTelegramConfigured(),
    botUsername: await getBotUsername(),
  });
});

export const POST = withApi(async (req) => {
  await connection();
  const user = await requireCoreUser(req);
  if (!isTelegramConfigured())
    throw new ApiError(
      503,
      "O envio pelo Telegram está temporariamente indisponível",
      "telegram_unavailable",
    );
  const db = await requirePrisma().user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  });
  if (!db?.telegramChatId)
    throw new ApiError(
      400,
      "Conecte o Telegram antes de enviar o teste",
      "missing_chat_id",
    );
  const res = await sendTelegramMessage(
    db.telegramChatId,
    "✅ CryptoScanner conectado. Você receberá aqui os alertas dos seus agentes.",
  );
  if (!res.ok)
    throw new ApiError(
      502,
      `Telegram recusou o envio: ${res.error ?? "erro"}`,
      "telegram_failed",
    );
  return ok({ sent: true });
});
