"use client";

import * as React from "react";
import useSWR from "swr";
import { CircleCheck, ExternalLink, Loader2, RefreshCw, Send, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/providers/toast-provider";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, postJson } from "@/lib/client-api";

const POLL_MS = 3_000;
const POLL_WINDOW_MS = 3 * 60_000;

type Phase =
  | { kind: "idle" }
  | { kind: "waiting"; url: string; deadline: number }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

/** Erros que encerram a verificação automática; os demais (ex.: Telegram ocupado) seguem até o prazo de 3 min. */
const STOP_POLLING_CODES = new Set(["telegram_webhook_set", "telegram_unavailable"]);
const CHAT_ID_RE = /^-?\d+$/;

function errMessage(err: unknown): string {
  return err instanceof ApiClientError
    ? err.message
    : "Não foi possível conectar agora. Verifique sua internet e tente de novo.";
}

/**
 * Conexão do Telegram com um clique: gera o deep link do bot, abre o Telegram e verifica
 * a cada 3 s se o usuário tocou em "Iniciar". O Chat ID manual fica disponível num bloco recolhido.
 */
export function TelegramConnect({
  planAllows = true,
  onChanged,
}: {
  /** Plano permite alertas no Telegram (habilita a mensagem de teste). */
  planAllows?: boolean;
  onChanged?: () => void;
}) {
  const { telegramConnected: connected, refresh } = useSession();
  const { data: info } = useSWR<{
    configured: boolean;
    botUsername: string | null;
  }>("/api/telegram/test");
  const { toast } = useToast();
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [busy, setBusy] = React.useState<
    "link" | "check" | "test" | "disconnect" | "save" | null
  >(null);
  const [chatId, setChatId] = React.useState("");
  const chatIdTrimmed = chatId.trim();
  const chatIdInvalid = chatIdTrimmed !== "" && !CHAT_ID_RE.test(chatIdTrimmed);
  const inFlight = React.useRef(false);
  const waitingActionsRef = React.useRef<HTMLDivElement>(null);
  const onChangedRef = React.useRef(onChanged);
  React.useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const changed = React.useCallback(async () => {
    await refresh();
    onChangedRef.current?.();
  }, [refresh]);

  const check = React.useCallback(
    async (manual: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (manual) setBusy("check");
      try {
        const res = await postJson<{ connected: boolean }>(
          "/api/telegram/link/check",
          {},
        );
        if (res.connected) {
          setPhase({ kind: "idle" });
          toast({ title: "Telegram conectado", variant: "success" });
          await changed();
        } else if (manual) {
          toast({
            title: "Ainda não recebemos sua mensagem",
            description:
              "No Telegram, toque em Iniciar na conversa com o bot e tente de novo.",
            variant: "warning",
          });
        }
      } catch (err) {
        if (err instanceof ApiClientError && STOP_POLLING_CODES.has(err.code)) {
          setPhase({ kind: "error", message: err.message });
        } else if (manual) {
          toast({
            title: "Falha ao verificar",
            description: errMessage(err),
            variant: "danger",
          });
        }
      } finally {
        inFlight.current = false;
        if (manual) setBusy(null);
      }
    },
    [changed, toast],
  );

  const checkRef = React.useRef(check);
  React.useEffect(() => {
    checkRef.current = check;
  }, [check]);

  // Verificação periódica enquanto aguarda o toque em "Iniciar".
  const deadline = phase.kind === "waiting" ? phase.deadline : null;

  // Ao aparecer o aviso de espera, o foco vai para "Já toquei em Iniciar" (primeiro botão do bloco).
  React.useEffect(() => {
    if (deadline === null) return;
    waitingActionsRef.current?.querySelector("button")?.focus();
  }, [deadline]);
  React.useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      if (Date.now() > deadline) {
        window.clearInterval(id);
        setPhase((p) => (p.kind === "waiting" ? { kind: "timeout" } : p));
        return;
      }
      void checkRef.current(false);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [deadline]);

  const start = async () => {
    // Abre a aba já no clique (antes da resposta) para não ser barrada pelo bloqueador de pop-ups.
    const win = window.open("", "_blank");
    setBusy("link");
    try {
      const res = await postJson<{ url: string; expiresInSec: number }>(
        "/api/telegram/link",
        {},
      );
      if (win) {
        win.opener = null;
        win.location.href = res.url;
      }
      setPhase({
        kind: "waiting",
        url: res.url,
        deadline: Date.now() + POLL_WINDOW_MS,
      });
    } catch (err) {
      win?.close();
      setPhase({ kind: "error", message: errMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    try {
      await postJson("/api/telegram/test", {});
      toast({ title: "Mensagem de teste enviada", variant: "success" });
    } catch (err) {
      toast({
        title: "Telegram falhou",
        description: errMessage(err),
        variant: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await postJson("/api/telegram/link", {}, "DELETE");
      setPhase({ kind: "idle" });
      toast({ title: "Telegram desconectado", variant: "success" });
      await changed();
    } catch (err) {
      toast({
        title: "Falha ao desconectar",
        description: errMessage(err),
        variant: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveManual = async () => {
    setBusy("save");
    try {
      await postJson(
        "/api/preferences",
        { telegramChatId: chatIdTrimmed },
        "PATCH",
      );
      toast({ title: "Chat ID salvo", variant: "success" });
      setChatId("");
      setPhase({ kind: "idle" });
      await changed();
    } catch (err) {
      toast({
        title: "Falha ao salvar",
        description: errMessage(err),
        variant: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  if (info && !info.configured) {
    return (
      <Alert variant="warning">
        O envio pelo Telegram está temporariamente indisponível. Os alertas
        continuam chegando no painel e por push.
      </Alert>
    );
  }

  const manual = (
    <details className="group rounded-md border border-border px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        Conectar manualmente (Chat ID)
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-muted-foreground">
          Abra{" "}
          {info?.botUsername ? (
            <a
              className="text-primary hover:underline"
              href={`https://t.me/${info.botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{info.botUsername}
            </a>
          ) : (
            "o bot"
          )}{" "}
          e toque em <strong>Iniciar</strong>. Descubra seu Chat ID com{" "}
          <a
            className="text-primary hover:underline"
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noopener noreferrer"
          >
            @userinfobot
          </a>{" "}
          e cole abaixo.
        </p>
        <Label htmlFor="telegram-chat-id">Chat ID</Label>
        <div className="flex gap-2">
          <Input
            id="telegram-chat-id"
            name="telegramChatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="Ex.: 123456789…"
            inputMode="text"
            pattern="-?\d+"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={chatIdInvalid || undefined}
            aria-describedby={chatIdInvalid ? "telegram-chat-id-error" : undefined}
          />
          <Button
            variant="secondary"
            onClick={() => void saveManual()}
            loading={busy === "save"}
            disabled={!chatIdTrimmed || chatIdInvalid}
          >
            Salvar Chat ID
          </Button>
        </div>
        {chatIdInvalid ? (
          <p id="telegram-chat-id-error" className="text-danger">
            Use só números. Chat ID de grupo começa com &quot;-&quot;.
          </p>
        ) : null}
      </div>
    </details>
  );

  if (connected) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="info">
            <CircleCheck className="h-3 w-3" aria-hidden /> Conectado
          </Badge>
          <span className="text-xs text-muted-foreground">
            Os alertas dos seus agentes e monitores chegam no Telegram.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void sendTest()}
            loading={busy === "test"}
            disabled={!planAllows || busy !== null}
          >
            <Send className="h-4 w-4" aria-hidden /> Enviar mensagem de teste
          </Button>
          <Button
            variant="ghost"
            onClick={() => void disconnect()}
            loading={busy === "disconnect"}
            disabled={busy !== null}
          >
            <Unlink className="h-4 w-4" aria-hidden /> Desconectar
          </Button>
        </div>
        {manual}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {phase.kind === "waiting" ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3"
        >
          <div className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            Abra o Telegram e toque em Iniciar…
          </div>
          <p className="text-xs text-muted-foreground">
            A conexão é confirmada automaticamente. Se o Telegram não abriu,{" "}
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline"
              href={phase.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              abra o bot por este link
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            .
          </p>
          <div ref={waitingActionsRef} className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void check(true)}
              loading={busy === "check"}
            >
              Já toquei em Iniciar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPhase({ kind: "idle" })}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {phase.kind === "timeout" ? (
            <Alert
              variant="warning"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void start()}
                  loading={busy === "link"}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden /> Tentar de novo
                </Button>
              }
            >
              Não recebemos a confirmação do Telegram. Toque em Iniciar na
              conversa com o bot e tente de novo.
            </Alert>
          ) : null}
          {phase.kind === "error" ? (
            <Alert variant="danger">{phase.message}</Alert>
          ) : null}
          {phase.kind !== "timeout" ? (
            <Button
              className="self-start"
              onClick={() => void start()}
              loading={busy === "link"}
            >
              <Send className="h-4 w-4" aria-hidden /> Conectar Telegram
            </Button>
          ) : null}
        </>
      )}
      {manual}
    </div>
  );
}

/** Card completo de alertas no Telegram (título, estado e conexão). */
export function TelegramCard({
  planAllows = true,
  onChanged,
  className,
}: {
  planAllows?: boolean;
  onChanged?: () => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" aria-hidden /> Alertas no
          Telegram
        </CardTitle>
        <CardDescription>
          Receba sinais de compra/venda diretamente no Telegram, sem precisar
          abrir o site.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!planAllows ? (
          <Alert variant="info">
            Alertas no Telegram estão disponíveis nos planos PRO e ELITE.
          </Alert>
        ) : null}
        <TelegramConnect planAllows={planAllows} onChanged={onChanged} />
      </CardContent>
    </Card>
  );
}
