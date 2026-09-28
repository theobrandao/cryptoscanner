"use client";

import * as React from "react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, postJson } from "@/lib/client-api";

export function SupportForm() {
  const { user, loading } = useSession();
  return (
    <PageShell>
      <PageTitle icon="🆘" title="Suporte" description="Dúvidas sobre o scanner, agentes, planos ou dados? Abra um chamado." />
      {loading ? null : <SupportFormBody key={user?.email ?? "anon"} initialEmail={user?.email ?? ""} />}
    </PageShell>
  );
}

function SupportFormBody({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = React.useState(initialEmail);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<{ ok?: string; error?: string }>({});
  const [loading, setLoading] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setState({});
    try {
      const res = await postJson<{ id: string }>("/api/support", { email, subject, message });
      setState({ ok: `Chamado registrado (${res.id}). Responderemos por e-mail.` });
      setSubject("");
      setMessage("");
    } catch (err) {
      setState({ error: err instanceof ApiClientError ? err.message : "Falha ao enviar." });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Abrir chamado</CardTitle>
        <CardDescription>Os chamados são gravados no banco de dados (tabela SupportTicket) para triagem.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-email">E-mail</Label>
            <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-subject">Assunto</Label>
            <Input id="s-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={120} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-msg">Mensagem</Label>
            <Textarea id="s-msg" value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={4000} rows={6} />
          </div>
          {state.ok ? <Alert variant="success">{state.ok}</Alert> : null}
          {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
          <Button type="submit" loading={loading} className="self-start">
            Enviar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
