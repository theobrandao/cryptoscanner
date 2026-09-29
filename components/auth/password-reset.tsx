"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ApiClientError, postJson } from "@/lib/client-api";

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState<{ emailEnabled: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setDone(await postJson<{ emailEnabled: boolean }>("/api/auth/password/forgot", { email }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Falha inesperada.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Esqueci minha senha</CardTitle>
        <CardDescription>Enviaremos um link de redefinição válido por 60 minutos.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <Alert variant="info">
            {done.emailEnabled
              ? "Se houver uma conta com esse e-mail, o link foi enviado. Verifique também a caixa de spam."
              : "O envio de e-mail ainda não está ativo. Fale com o suporte pela página Help & Support para redefinir a senha."}
          </Alert>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <Button type="submit" loading={loading}>
              Enviar link
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    setError(null);
    try {
      await postJson("/api/auth/password/reset", { token, password });
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Falha inesperada.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Nova senha</CardTitle>
        <CardDescription>Mínimo de 8 caracteres com letras e números.</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? <Alert variant="danger">Link sem token. Peça um novo em “Esqueci minha senha”.</Alert> : null}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="password">Nova senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Button type="submit" loading={loading} disabled={!token}>
            Salvar nova senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
