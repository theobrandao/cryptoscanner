"use client";

import * as React from "react";
import useSWR from "swr";
import { Bell, BellOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, postJson } from "@/lib/client-api";

interface PushInfo {
  configured: boolean;
  publicKey: string | null;
  subscriptions: number;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const noopSubscribe = () => () => undefined;

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Ativa/desativa notificações push neste navegador (agentes, sentinelas, alertas e falhas do sistema). */
export function PushCard() {
  const { data, mutate } = useSWR<PushInfo>("/api/push/subscribe");
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [endpoint, setEndpoint] = React.useState<string | null>(null);
  const supported = React.useSyncExternalStore(
    noopSubscribe,
    pushSupported,
    () => true,
  );

  React.useEffect(() => {
    if (!pushSupported()) return;
    let alive = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (alive) setEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const enable = async () => {
    if (!data?.publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted")
        throw new Error("Permissão de notificação negada no navegador");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
        }));
      await postJson("/api/push/subscribe", sub.toJSON());
      setEndpoint(sub.endpoint);
      await mutate();
      toast({
        title: "Notificações ativadas neste navegador",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Não foi possível ativar",
        description:
          err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await postJson(
          "/api/push/subscribe",
          { endpoint: sub.endpoint },
          "DELETE",
        );
        await sub.unsubscribe();
      }
      setEndpoint(null);
      await mutate();
      toast({
        title: "Notificações desativadas neste navegador",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Falha ao desativar",
        description: (err as Error).message,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await postJson<{ sent: number }>("/api/push/test", {});
      toast({
        title:
          r.sent > 0
            ? `Enviada para ${r.sent} navegador(es)`
            : "Nenhum navegador inscrito recebeu",
        variant: r.sent > 0 ? "success" : "danger",
      });
    } catch (err) {
      toast({
        title: "Falha no teste",
        description: err instanceof ApiClientError ? err.message : String(err),
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Notificações no navegador
        </CardTitle>
        <CardDescription>
          Sinais de agentes e sentinelas, alertas disparados e falhas do ciclo
          automático. Funciona com o app fechado (Chrome, Edge, Firefox; no
          iPhone, só com o app instalado na tela inicial).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!supported ? (
          <Alert variant="warning">
            Este navegador não suporta notificações push.
          </Alert>
        ) : null}
        {data && !data.configured ? (
          <Alert variant="warning">
            As notificações push estão temporariamente indisponíveis.
          </Alert>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {endpoint
            ? "Ativas neste navegador."
            : "Desativadas neste navegador."}{" "}
          {data ? `Navegadores inscritos na conta: ${data.subscriptions}.` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {endpoint ? (
            <Button
              variant="outline"
              onClick={() => void disable()}
              loading={busy}
              className="min-h-10"
            >
              <BellOff className="h-4 w-4" /> Desativar
            </Button>
          ) : (
            <Button
              onClick={() => void enable()}
              loading={busy}
              disabled={!supported || !data?.configured}
              className="min-h-10"
            >
              <Bell className="h-4 w-4" /> Ativar notificações
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void test()}
            disabled={busy || !data?.subscriptions}
            className="min-h-10"
          >
            <Send className="h-4 w-4" /> Enviar teste
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
