"use client";

import * as React from "react";
import {
  Brain,
  Flame,
  GraduationCap,
  MousePointerClick,
  OctagonX,
  TrendingUp,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClientError, postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface Reply {
  answer: string;
  sources: string[];
  suggestions: string[];
  mode: "rules" | "llm";
  data?: { symbol?: string };
}
interface Msg {
  role: "user" | "mentor";
  text: string;
  sources?: string[];
  suggestions?: string[];
  mode?: "rules" | "llm";
}

const SOS: Array<{
  icon: LucideIcon;
  tone: string;
  label: string;
  text: string;
}> = [
  {
    icon: OctagonX,
    tone: "text-danger",
    label: "Tomei stop",
    text: "Tomei stop agora, e agora?",
  },
  {
    icon: Flame,
    tone: "text-warning",
    label: "FOMO",
    text: "Está subindo forte e estou com FOMO",
  },
  {
    icon: TrendingUp,
    tone: "text-success",
    label: "Euforia pós-ganho",
    text: "Ganhei muito hoje, estou em euforia",
  },
  {
    icon: MousePointerClick,
    tone: "text-primary",
    label: "Medo de clicar",
    text: "Estou com medo de clicar e entrar na operação",
  },
  {
    icon: Wind,
    tone: "text-muted-foreground",
    label: "Reset mental",
    text: "Preciso de um reset mental",
  },
];

/** Mentor: chat determinístico com base própria + dados ao vivo; LLM só se configurado no servidor. */
export function MentorView() {
  const router = useRouter();
  const [msgs, setMsgs] = React.useState<Msg[]>([
    {
      role: "mentor",
      text: "Olá. Posso responder com dados reais do mercado (“como está o SOL em 4h?”), explicar os 17 padrões e os indicadores, ajudar com gestão de risco e aplicar os protocolos de mindset. Não recomendo compra ou venda.",
      suggestions: [
        "Como está o BTC hoje?",
        "O que é uma cunha de alta?",
        "Como calcular o tamanho da posição?",
      ],
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const r = await postJson<Reply>("/api/mentor", { message: q });
      setMsgs((m) => [
        ...m,
        {
          role: "mentor",
          text: r.answer,
          sources: r.sources,
          suggestions: r.suggestions,
          mode: r.mode,
        },
      ]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        {
          role: "mentor",
          text:
            err instanceof ApiClientError
              ? err.message
              : "Falha ao responder. Tente novamente.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(
        () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
  };

  const act = (s: string) => {
    const m = /^Abrir o gráfico de (\w+)/.exec(s);
    if (m) return router.push(`/graficos?symbol=${m[1]}`);
    const c = /^Criar um Sentinela para (\w+)/.exec(s);
    if (c) return router.push("/sentinela");
    if (/^Abrir o Panorama/.test(s)) return router.push("/panorama");
    if (/^Escanear agora/.test(s)) return router.push("/scanner/padroes");
    if (/^Abrir a aula/.test(s)) return router.push("/jornada");
    void send(s);
  };

  return (
    <PageShell>
      <PageTitle
        icon={<GraduationCap className="h-5 w-5" />}
        title="Mentor"
        description="Tire dúvidas sobre o mercado e sobre as ferramentas. As respostas usam os dados reais do app; quando um número não está disponível, o analista diz que não sabe."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="flex h-[560px] flex-col p-0">
            <div className="flex-1 space-y-3 overflow-auto p-4">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {m.text}
                    {m.sources?.length ? (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Fonte: {m.sources.join(" · ")}
                        {m.mode === "llm" ? " · redigido por IA" : ""}
                      </div>
                    ) : null}
                    {m.suggestions?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => act(s)}
                            className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-primary/10 cursor-pointer"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {loading ? (
                <div className="text-xs text-muted-foreground">
                  consultando dados…
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex gap-2 border-t border-border p-3"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte sobre um ativo, um padrão, um indicador ou como está se sentindo…"
                maxLength={500}
                aria-label="Mensagem para o mentor"
              />
              <Button type="submit" loading={loading} disabled={!input.trim()}>
                Enviar
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="h-4 w-4 text-primary" aria-hidden /> SOS Mindset
              & Emoções
            </div>
            <p className="text-xs text-muted-foreground">
              Protocolos objetivos para os estados que mais destroem contas.
            </p>
            {SOS.map((s) => (
              <Button
                key={s.label}
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => void send(s.text)}
              >
                <s.icon className={cn("h-3.5 w-3.5", s.tone)} aria-hidden />{" "}
                {s.label}
              </Button>
            ))}
            <div className="mt-2 text-xs text-muted-foreground">
              Respostas baseadas nos dados ao vivo do app.
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
