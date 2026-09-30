"use client";

import * as React from "react";
import { Settings } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/components/providers/theme-provider";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/components/providers/toast-provider";
import { PushCard } from "@/components/account/push-card";
import { TelegramCard } from "@/components/account/telegram-connect";
import { ApiClientError, postJson } from "@/lib/client-api";
import { PLANS } from "@/lib/plans";

interface PrefPayload {
  preference: {
    theme: string;
    currency: string;
    defaultTimeframe: string;
    autoRefreshSec: number;
  };
  telegramChatId: string | null;
  name: string;
  email: string;
  plan: string;
}

export function PreferencesView() {
  const { user, loading, refresh } = useSession();
  const { data, mutate } = useSWR<PrefPayload>(
    user ? "/api/preferences" : null,
  );
  if (loading)
    return (
      <PageShell>
        <Skeleton className="h-40" />
      </PageShell>
    );
  if (!user)
    return (
      <PageShell>
        <Alert
          variant="info"
          title="Faça login para editar suas preferências"
          action={
            <Link
              href="/login?next=/preferencias"
              className="text-sm text-primary hover:underline"
            >
              Entrar
            </Link>
          }
        />
      </PageShell>
    );
  return (
    <PageShell>
      <PageTitle
        icon={<Settings className="h-5 w-5" />}
        title="Preferências"
        description={`${user.email} · plano ${PLANS[user.plan]?.name ?? user.plan}`}
      />
      {!data ? (
        <Skeleton className="h-64 max-w-2xl" />
      ) : (
        <div className="flex flex-col gap-4">
          <PreferencesForm
            key={JSON.stringify(data)}
            data={data}
            onSaved={async () => {
              await Promise.all([mutate(), refresh()]);
            }}
          />
          <TelegramCard
            className="max-w-2xl"
            planAllows={PLANS[user.plan]?.telegramAlerts ?? false}
            onChanged={() => void mutate()}
          />
          <PushCard />
        </div>
      )}
    </PageShell>
  );
}

function PreferencesForm({
  data,
  onSaved,
}: {
  data: PrefPayload;
  onSaved: () => Promise<void>;
}) {
  const { theme, setTheme } = useTheme();
  const [, setCurrencyLocal] = useLocalStorage<"USD" | "BRL">(
    "cs-currency",
    "USD",
  );
  const { toast } = useToast();
  const [form, setForm] = React.useState({
    name: data.name,
    currency: data.preference.currency,
    defaultTimeframe: data.preference.defaultTimeframe,
    autoRefreshSec: String(data.preference.autoRefreshSec),
  });
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await postJson(
        "/api/preferences",
        {
          name: form.name,
          currency: form.currency,
          defaultTimeframe: form.defaultTimeframe,
          autoRefreshSec: Number(form.autoRefreshSec),
          theme,
        },
        "PATCH",
      );
      setCurrencyLocal(form.currency as "USD" | "BRL");
      await onSaved();
      toast({ title: "Preferências salvas", variant: "success" });
    } catch (err) {
      toast({
        title: "Falha ao salvar",
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
        <CardTitle>Conta e interface</CardTitle>
        <CardDescription>
          Nome, tema, moeda de exibição e timeframe padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label>Nome</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Tema</Label>
          <Select
            value={theme}
            onValueChange={(v) => setTheme(v as "dark" | "light")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Escuro</SelectItem>
              <SelectItem value="light">Claro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Moeda</Label>
          <Select
            value={form.currency}
            onValueChange={(v) => setForm({ ...form, currency: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="BRL">BRL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Timeframe padrão</Label>
          <Select
            value={form.defaultTimeframe}
            onValueChange={(v) => setForm({ ...form, defaultTimeframe: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["1h", "4h", "1d", "1w"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Auto-atualização (s)</Label>
          <Input
            inputMode="numeric"
            value={form.autoRefreshSec}
            onChange={(e) =>
              setForm({ ...form, autoRefreshSec: e.target.value })
            }
          />
        </div>
        <Button
          onClick={() => void save()}
          loading={busy}
          className="sm:col-span-2 justify-self-start"
        >
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
