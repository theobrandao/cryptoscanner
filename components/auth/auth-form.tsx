"use client";

import * as React from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/entitlements";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const { refresh } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [invite, setInvite] = React.useState("");
  const [inviteRequired, setInviteRequired] = React.useState(false);
  const [accept, setAccept] = React.useState(false);

  React.useEffect(() => {
    if (mode !== "register") return;
    let alive = true;
    apiFetch<{ inviteRequired: boolean }>("/api/auth/register")
      .then((d) => {
        if (alive) setInviteRequired(d.inviteRequired);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") await postJson("/api/auth/register", { name, email, password, acceptTerms: accept, ...(invite ? { invite } : {}) });
      else await postJson("/api/auth/login", { email, password });
      await refresh();
      // só caminhos internos: "/x" sim; "//host" e "/\\host" não (open redirect)
      router.push(/^\/(?![/\\])/.test(next) ? next : "/");
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = Array.isArray(err.details) ? (err.details as Array<{ path: string; message: string }>).map((d) => `${d.path}: ${d.message}`).join("; ") : "";
        setError(details ? `${err.message} — ${details}` : err.message);
      } else setError("Falha inesperada. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} {mode === "login" ? "Entrar" : "Criar conta"}
        </CardTitle>
        <CardDescription>
          {mode === "login" ? "Acesse seu workspace, estratégias, monitores e watchlists." : `${TRIAL_DAYS} dias grátis no PRO, sem cartão. Depois, PRO ou ELITE.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "login" && params.get("reset") === "1" ? (
          <Alert variant="success" className="mb-3">
            Senha redefinida. Entre com a nova senha.
          </Alert>
        ) : null}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          {mode === "register" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            {mode === "register" ? <span className="text-xs text-muted-foreground">Mínimo de 8 caracteres com letras e números.</span> : null}
          </div>
          {mode === "register" && inviteRequired ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="invite">Código de convite</Label>
              <Input id="invite" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" />
              <span className="text-xs text-muted-foreground">Cadastro por convite nesta fase.</span>
            </div>
          ) : null}
          {mode === "register" ? (
            <label className="flex min-h-11 items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <input id="accept-terms" type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]" />
              <span>
                Li e aceito os{" "}
                <Link href="/termos" target="_blank" className="text-primary underline">
                  Termos de Uso
                </Link>
                , a{" "}
                <Link href="/privacidade" target="_blank" className="text-primary underline">
                  Política de Privacidade
                </Link>{" "}
                e a{" "}
                <Link href="/reembolso" target="_blank" className="text-primary underline">
                  Política de Cancelamento e Reembolso
                </Link>
                . Entendo que o CryptoScanner é ferramenta de análise técnica e não faz recomendação de investimento.
              </span>
            </label>
          ) : null}
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Button type="submit" loading={loading} disabled={mode === "register" && !accept}>
            {mode === "login" ? "Entrar" : `Começar ${TRIAL_DAYS} dias grátis`}
          </Button>
          {mode === "login" ? (
            <Link href="/esqueci-senha" className="inline-flex min-h-10 items-center justify-center text-xs text-muted-foreground hover:text-foreground">
              Esqueci minha senha
            </Link>
          ) : null}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <Link href={`/registro?next=${encodeURIComponent(next)}`} className="text-primary hover:underline">
                Cadastre-se
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-primary hover:underline">
                Entrar
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
