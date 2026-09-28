"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, postJson } from "@/lib/client-api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/scanner";
  const { refresh } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") await postJson("/api/auth/register", { name, email, password });
      else await postJson("/api/auth/login", { email, password });
      await refresh();
      router.push(next.startsWith("/") ? next : "/scanner");
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
          {mode === "login" ? "Acesse seus agentes, watchlist, alertas e análises salvas." : "Conta gratuita: scanner em 4H/1D/7D, 3 análises de IA por dia e até 2 agentes."}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Button type="submit" loading={loading}>
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
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
