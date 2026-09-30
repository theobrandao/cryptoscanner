"use client";

import * as React from "react";
import { BookOpen, CircleCheck, ClipboardList, Inbox, LifeBuoy, Lock, Send, Ticket, Trash2, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { ApiClientError, apiFetch, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { PLANS } from "@/lib/plans";

/** Perguntas frequentes — conteúdo próprio sobre esta implementação. */
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "De onde vêm os dados de preço e candles?",
    a: "Da Binance Spot (fonte principal), com troca automática para a base pública oficial da Binance e, por último, para a Kraken quando a fonte principal fica indisponível. Câmbio, capitalização e dados globais vêm da CoinGecko; o Índice de Medo e Ganância da alternative.me. Nenhum dado é inventado: quando uma fonte falha, a interface indica “dados com defasagem”.",
  },
  {
    q: "O que significa a “confiança” de um padrão?",
    a: "É o grau de aderência geométrica da formação (0–100) calculado por regras determinísticas sobre pivôs fractais, ATR e regressão linear. Não é probabilidade de lucro. Padrões de altcoins contra a tendência do BTC recebem rebaixamento explícito.",
  },
  {
    q: "Quais timeframes cada plano libera no scanner?",
    a: "Teste grátis e PRO: 4H, 1D e 7D. ELITE: também 1H, 30M e 15M. A verificação é feita no servidor, não só na interface.",
  },
  {
    q: "Com que frequência os agentes verificam o mercado?",
    a: "A cada 5 minutos, no servidor (independente do navegador), com cooldown mínimo de 30 minutos entre alertas do mesmo agente. O horário da última verificação aparece no cartão do agente.",
  },
  {
    q: "Como recebo alertas no Telegram?",
    a: "Informe seu Chat ID em Preferências (envie /start ao bot e use um bot como @userinfobot para descobrir o ID), teste com “Enviar alerta de teste” e configure o agente com notificação “Telegram” ou “Log + Telegram”. Alertas no Telegram exigem plano PRO ou ELITE.",
  },
  {
    q: "Como funciona a análise de gráfico por IA?",
    a: "Você envia a imagem do gráfico (JPG, PNG ou WebP até 5 MB) e informa o ativo e o timeframe. A leitura usa os dados reais de mercado desse ativo (preço, padrões, tendência e níveis), e a imagem fica salva junto com a análise. Quando um dado não está disponível, a análise informa em vez de estimar.",
  },
  {
    q: "Os sinais são recomendação de investimento?",
    a: "Não. Todo conteúdo é informativo e educacional, gerado por algoritmos a partir de dados públicos. Criptoativos envolvem risco elevado, inclusive perda total do capital. A decisão é sempre sua.",
  },
  {
    q: "Posso trocar de plano?",
    a: "Sim, pela página Planos. O cancelamento pode ser feito a qualquer momento e o acesso segue até o fim do período pago.",
  },
  {
    q: "Meus dados ficam salvos onde?",
    a: "Conta, preferências, watchlist, agentes, alertas, análises e histórico ficam armazenados nos servidores do CryptoScanner. Senhas são guardadas de forma criptografada e a sessão é protegida. Não compartilhamos dados com terceiros.",
  },
  {
    q: "Como excluo minha conta?",
    a: "Nesta página, em “Exclusão de conta e dados”: confirme a senha e digite EXCLUIR. A remoção é imediata e irreversível (LGPD, art. 18). Chamados de suporte ficam anonimizados para auditoria do atendimento.",
  },
];

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

export function SupportForm({ initialSubject = "" }: { initialSubject?: string }) {
  const { user, loading } = useSession();
  const plan = PLANS[user?.plan ?? "FREE"];
  return (
    <PageShell>
      <PageTitle
        icon={<LifeBuoy className="h-5 w-5" />}
        title="Central de Atendimento"
        description="Dúvidas sobre o scanner, agentes, planos ou dados? Consulte a FAQ, abra um chamado ou gerencie sua conta."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {loading ? null : (
            <SupportFormBody
              key={user?.email ?? "anon"}
              initialEmail={user?.email ?? ""}
              initialSubject={initialSubject}
            />
          )}
          {user ? <MyTickets /> : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden />{" "}
                Perguntas frequentes
              </CardTitle>
              <CardDescription>
                As 10 dúvidas mais comuns sobre plataforma, planos e
                funcionalidades.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {FAQ.map((f) => (
                  <details key={f.q} className="group py-2">
                    <summary className="cursor-pointer list-none text-sm font-semibold marker:content-none">
                      <span className="mr-2 text-primary group-open:hidden">
                        +
                      </span>
                      <span className="mr-2 hidden text-primary group-open:inline">
                        −
                      </span>
                      {f.q}
                    </summary>
                    <p className="mt-1 pl-5 text-sm text-muted-foreground">
                      {f.a}
                    </p>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Canais por plano</CardTitle>
              <CardDescription>
                Seu plano:{" "}
                <Badge
                  variant={
                    plan.key === "PLATINUM"
                      ? "elite"
                      : plan.key === "PRO"
                        ? "pro"
                        : "muted"
                  }
                >
                  {plan.name}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Channel
                icon={BookOpen}
                title="Central de FAQ"
                desc="Disponível 24/7 para todos os planos."
                available
              />
              <Channel
                icon={Ticket}
                title="Chamado por e-mail"
                desc="Formulário desta página; resposta pelo e-mail informado."
                available
              />
              <Channel
                icon={Zap}
                title="Chamado prioritário"
                desc="Fila prioritária de atendimento."
                available={plan.key !== "FREE"}
                lockedText="Disponível nos planos PRO e ELITE"
              />
              <Channel
                icon={Send}
                title="Suporte VIP no Telegram"
                desc="Canal direto com a equipe."
                available={plan.key === "PLATINUM"}
                lockedText="Disponível no plano ELITE"
              />
            </CardContent>
          </Card>
          {user ? <DeleteAccountCard /> : null}
        </div>
      </div>
    </PageShell>
  );
}

function Channel({
  icon: Icon,
  title,
  desc,
  available,
  lockedText,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  available: boolean;
  lockedText?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          {available ? (
            <Badge variant="info">
              <CircleCheck className="h-3 w-3" aria-hidden /> disponível
            </Badge>
          ) : (
            <Badge variant="muted" className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden /> bloqueado
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {available ? desc : lockedText}
        </p>
      </div>
    </div>
  );
}

function MyTickets() {
  const { data, error } = useSWR<{ items: Ticket[] }>("/api/support", {
    refreshInterval: 60_000,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden /> Meus
          chamados
        </CardTitle>
        <CardDescription>Chamados abertos com esta conta.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="danger">
            Não foi possível carregar seus chamados.
          </Alert>
        ) : null}
        {data && data.items.length === 0 ? (
          <EmptyState
            icon={
              <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
            }
            title="Nenhum chamado"
            description="Quando você abrir um chamado ele aparece aqui com o status."
          />
        ) : null}
        {data && data.items.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {data.items.map((t) => (
              <li
                key={t.id}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold">{t.subject}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.message}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <Badge
                    variant={
                      t.status === "open"
                        ? "warning"
                        : t.status === "closed"
                          ? "muted"
                          : "default"
                    }
                  >
                    {t.status === "open"
                      ? "aberto"
                      : t.status === "closed"
                        ? "encerrado"
                        : t.status}
                  </Badge>
                  <div>{formatDateTime(t.createdAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SupportFormBody({ initialEmail, initialSubject }: { initialEmail: string; initialSubject: string }) {
  const [email, setEmail] = React.useState(initialEmail);
  const [subject, setSubject] = React.useState(initialSubject);
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<{ ok?: string; error?: string }>({});
  const [loading, setLoading] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setState({});
    try {
      const res = await postJson<{ id: string }>("/api/support", {
        email,
        subject,
        message,
      });
      setState({
        ok: `Chamado registrado (${res.id}). Responderemos por e-mail.`,
      });
      setSubject("");
      setMessage("");
    } catch (err) {
      setState({
        error: err instanceof ApiClientError ? err.message : "Falha ao enviar.",
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" aria-hidden /> Abrir chamado
        </CardTitle>
        <CardDescription>
          Os chamados ficam registrados para triagem e aparecem em “Meus
          chamados” quando você está logado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-email">E-mail</Label>
            <Input
              id="s-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-subject">Assunto</Label>
            <Input
              id="s-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="s-msg">Mensagem</Label>
            <Textarea
              id="s-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
              maxLength={4000}
              rows={5}
            />
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

function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm, password }),
      });
      setOpen(false);
      router.push("/?conta=excluida");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Falha ao excluir a conta.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-danger" aria-hidden /> Exclusão de
          conta e dados
        </CardTitle>
        <CardDescription>
          Direito à exclusão conforme a LGPD (Lei 13.709/2018, art. 18).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Serão apagados de forma imediata e irreversível: perfil e dados
          cadastrais, preferências, watchlist e posições simuladas, agentes e
          seus logs, alertas, análises salvas e histórico de scans. Chamados de
          suporte ficam anonimizados (sem vínculo com a conta) para auditoria do
          atendimento.
        </p>
        <Button
          variant="danger"
          onClick={() => setOpen(true)}
          className="self-start"
        >
          Solicitar exclusão da conta
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta permanentemente</DialogTitle>
            <DialogDescription>
              Confirme sua senha e digite EXCLUIR. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="del-pass">Senha</Label>
              <Input
                id="del-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="del-confirm">Digite EXCLUIR para confirmar</Label>
              <Input
                id="del-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                placeholder="EXCLUIR"
              />
            </div>
            {error ? <Alert variant="danger">{error}</Alert> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={confirm !== "EXCLUIR" || !password}
              loading={loading}
              onClick={() => void submit()}
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
