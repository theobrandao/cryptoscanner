"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, ShieldCheck } from "lucide-react";
import { ToolIconView } from "@/components/layout/tool-icon";
import { ASSETS } from "@/lib/assets";
import { postJson } from "@/lib/client-api";
import { MAIN_TOOLS } from "@/lib/tools";
import { cn } from "@/lib/utils";

interface Prices {
  prices: { PRO: number; ELITE: number };
  trialDays: number;
  checkoutEnabled: boolean;
  limits: Record<"PRO" | "ELITE", { alerts: number; monitors: number; strategies: number; historyDays: number }>;
}

/** Dados estáticos vindos do servidor (evita levar zod e o conteúdo das aulas para o bundle da página de venda). */
export interface LandingData {
  validated: Array<{ name: string; description: string; validation: { label: string; summary: string; caveats: string } }>;
  lessonTitles: string[];
}

const FAQ = [
  ["O CryptoScanner recomenda compra ou venda?", "Não. As ferramentas calculam padrões, níveis e sinais com regras fixas e mostram de onde vem cada número. A decisão é sua. Não é recomendação de investimento."],
  ["O que quer dizer \"validado fora da amostra\"?", "As regras do modelo foram escolhidas com dados de um período e medidas em outro período, que não foi usado na escolha. Só publicamos o modelo porque o resultado nesse segundo período foi positivo, com taxas e slippage. O setup que não passou nesse teste não é vendido como estratégia."],
  ["Preciso conectar minha corretora ou informar chaves de API?", "Não. Usamos apenas dados públicos de mercado. O CryptoScanner nunca pede chaves de API nem executa ordens."],
  ["O teste de 7 dias pede cartão?", "Não. O teste libera as funções do PRO por 7 dias. Ao final, o acesso é pausado até você escolher um plano; seus dados ficam salvos."],
  ["Como cancelo?", "Em Planos, a qualquer momento, sem multa. O acesso segue até o fim do período pago. Na primeira contratação, o pedido em até 7 dias garante reembolso integral."],
  ["Funciona no celular?", "Sim. O site é responsivo e os avisos chegam por push no navegador e pelo Telegram."],
] as const;

interface SimResult {
  result: { totalInvested: number; finalValue: number; profitPct: number; maxDrawdownPct: number; startDate: number; endDate: number; contributions: number; input: { currency: string } };
}

function brl(v: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

/** Simulador compacto (API pública, não salva nada). */
function MiniSimulator() {
  const [symbol, setSymbol] = React.useState("BTC");
  const [strategy, setStrategy] = React.useState<"dca" | "lump_sum">("dca");
  const [amount, setAmount] = React.useState(500);
  const [months, setMonths] = React.useState<6 | 12 | 24 | 36>(24);
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<SimResult["result"] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = strategy === "dca" ? { symbol, strategy, currency: "BRL", initialCapital: 0, monthlyContribution: amount, months, riskProfile: "arrojado" } : { symbol, strategy, currency: "BRL", initialCapital: amount, monthlyContribution: 0, months, riskProfile: "arrojado" };
      const r = await postJson<SimResult>("/api/simulations/run", body);
      setRes(r.result);
    } catch (e) {
      setErr((e as Error).message || "Falha na simulação");
    } finally {
      setBusy(false);
    }
  };
  const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <label className="flex flex-col gap-1">
          Ativo
          <select className={sel} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {ASSETS.slice(0, 12).map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Forma
          <select className={sel} value={strategy} onChange={(e) => setStrategy(e.target.value as "dca" | "lump_sum")}>
            <option value="dca">Aporte mensal (DCA)</option>
            <option value="lump_sum">Aporte único</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {strategy === "dca" ? "Valor por mês (R$)" : "Valor (R$)"}
          <input type="number" min={50} step={50} className={sel} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="flex flex-col gap-1">
          Período
          <select className={sel} value={months} onChange={(e) => setMonths(Number(e.target.value) as 6 | 12 | 24 | 36)}>
            {[6, 12, 24, 36].map((m) => (
              <option key={m} value={m}>
                {m} meses
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void run()} disabled={busy || amount <= 0} className="col-span-2 mt-1 h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50">
          {busy ? "Calculando…" : "Simular com preços reais"}
        </button>
      </div>
      <div className="flex flex-col justify-center rounded-lg bg-muted/40 p-4 text-[13.5px]" aria-live="polite">
        {err ? <p className="text-danger">{err}</p> : null}
        {res ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] text-muted-foreground">Investido</div>
                <div className="tabular text-xl font-bold">{brl(res.totalInvested)}</div>
              </div>
              <div>
                <div className="text-[12px] text-muted-foreground">Valor final</div>
                <div className="tabular text-xl font-bold">{brl(res.finalValue)}</div>
              </div>
              <div>
                <div className="text-[12px] text-muted-foreground">Resultado</div>
                <div className={cn("tabular text-xl font-bold", res.profitPct >= 0 ? "text-success" : "text-danger")}>
                  {res.profitPct >= 0 ? "+" : ""}
                  {res.profitPct.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[12px] text-muted-foreground">Maior queda no caminho</div>
                <div className="tabular text-xl font-bold text-danger">−{res.maxDrawdownPct.toFixed(1)}%</div>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              {new Date(res.startDate).toLocaleDateString("pt-BR")} a {new Date(res.endDate).toLocaleDateString("pt-BR")} · fechamentos diários reais · simulação histórica, não projeção.
            </p>
          </>
        ) : !err ? (
          <p className="text-muted-foreground">Escolha o ativo, a forma de aporte e o período. O cálculo usa os preços diários reais do período, convertidos para reais pelo câmbio de cada dia.</p>
        ) : null}
      </div>
    </div>
  );
}

export function Landing({ content }: { content: LandingData }) {
  const VALIDATED = content.validated;
  const { data } = useSWR<Prices>("/api/billing/prices", { revalidateOnFocus: false });
  const [open, setOpen] = React.useState<number | null>(0);
  const trial = data?.trialDays ?? 7;
  const tools = MAIN_TOOLS.filter((t) => t.href !== "/");
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-4 py-10 sm:py-14">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="text-[13px] font-semibold text-primary">Scanner cripto · 30 ativos · dados públicos</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-[42px] sm:leading-[1.1]">Ferramentas claras para operar cripto, e um modelo testado fora da amostra.</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Scanner de padrões gráficos, agentes com alertas, Sentinela 24h, gráficos, Fibonacci, simulador e aulas. Na tela inicial, os sinais do modelo de rompimento com o resultado medido em um período que não foi usado para criá-lo.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/registro?next=/" className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110">
              Começar teste de {trial} dias
            </Link>
            <Link href="#ferramentas" className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold hover:bg-muted">
              Ver ferramentas
            </Link>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">Sem cartão no teste. Sem chaves de API. Cancele quando quiser.</p>
        </div>
        <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/inicio.jpg" alt="Tela inicial do CryptoScanner com mercado agora, sinais ativos do modelo validado e atalhos das ferramentas" width={1600} height={1000} className="h-auto w-full" />
          <figcaption className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">Captura da aplicação com dados reais do momento da captura.</figcaption>
        </figure>
      </section>

      <section id="ferramentas" aria-labelledby="tools" className="scroll-mt-20">
        <h2 id="tools" className="text-2xl font-bold tracking-tight">Uma ferramenta para cada tarefa</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">Cada item do menu faz uma coisa. As análises profundas ficam separadas, no grupo Avançado.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tools.map((t) => (
            <div key={t.href} className="rounded-lg border border-border bg-card p-4">
              <ToolIconView icon={t.icon} className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-[15px] font-semibold">{t.name}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{t.purpose}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="validado">
        <h2 id="validado" className="text-2xl font-bold tracking-tight">Modelo de rompimento: números fora da amostra</h2>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
          Regras escolhidas em um período e medidas em outro, com taxa e slippage, em 30 criptos. O setup de pullback que testamos junto não passou nesse teste e por isso não é oferecido como estratégia.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {VALIDATED.map((m) => (
            <div key={m.name} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold">{m.name}</h3>
                <span className="rounded bg-success/15 px-1.5 py-px text-[11px] font-semibold text-success">{m.validation.label}</span>
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">{m.description}</p>
              <p className="mt-3 text-[13px] leading-relaxed">{m.validation.summary}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-warning">{m.validation.caveats}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="simulador">
        <h2 id="simulador" className="text-2xl font-bold tracking-tight">Simulador de aportes</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">Quanto teria rendido aportar em cripto, com os preços reais do período.</p>
        <div className="mt-6">
          <MiniSimulator />
        </div>
      </section>

      <section aria-labelledby="ativos">
        <h2 id="ativos" className="text-2xl font-bold tracking-tight">{ASSETS.length} ativos monitorados</h2>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
          {ASSETS.map((a) => (
            <div key={a.symbol} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-[12.5px]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[12px]">{a.glyph}</span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{a.symbol}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{a.name}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="jornada" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <h2 id="jornada" className="text-2xl font-bold tracking-tight">Jornada: {content.lessonTitles.length} aulas</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">Do funcionamento do Bitcoin à automação com agentes. Cada aula tem teste e uma prática dentro do próprio app, e o progresso fica salvo na sua conta.</p>
        </div>
        <ol className="grid gap-1.5 text-[13px] sm:grid-cols-2">
          {content.lessonTitles.map((title, i) => (
            <li key={title} className="flex gap-2 rounded-md border border-border bg-card px-3 py-2">
              <span className="tabular w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
              {title}
            </li>
          ))}
        </ol>
      </section>

      <section id="planos" aria-labelledby="pricing" className="scroll-mt-20">
        <h2 id="pricing" className="text-2xl font-bold tracking-tight">Planos</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">Comece com {trial} dias de teste completo. Depois, escolha o plano.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(["PRO", "ELITE"] as const).map((p) => {
            const l = data?.limits[p];
            const items =
              p === "PRO"
                ? [
                    "Todas as ferramentas do menu principal",
                    "Sinais do modelo de rompimento validado (4H e 1D)",
                    `${l?.monitors ?? "—"} monitores no servidor · ${l?.alerts ?? "—"} alertas`,
                    `${l?.strategies ?? "—"} estratégias próprias · backtest de 1 timeframe`,
                    `${l ? Math.round(l.historyDays / 30) : "—"} meses de histórico no backtest`,
                    "Análise por IA: 100 consultas/dia",
                  ]
                : [
                    "Tudo do PRO",
                    "Backtest multi-timeframe",
                    `${l ? Math.round(l.historyDays / 365) : "—"} anos de histórico no backtest`,
                    `${l?.monitors ?? "—"} monitores · ${l?.alerts ?? "—"} alertas · ${l?.strategies ?? "—"} estratégias`,
                    "Análise por IA: 500 consultas/dia",
                  ];
            return (
              <div key={p} className={cn("flex flex-col rounded-xl border bg-card p-5", p === "ELITE" ? "border-primary/40" : "border-border")}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{p}</h3>
                </div>
                <div className="mt-2">
                  <span className="tabular text-3xl font-bold">{data ? `R$ ${data.prices[p]}` : "—"}</span>
                  <span className="text-sm text-muted-foreground"> /mês</span>
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-[13.5px]">
                  {items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {i}
                    </li>
                  ))}
                </ul>
                <Link href="/registro?next=/planos" className="mt-5 flex h-10 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110">
                  Começar teste de {trial} dias
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Cobrança mensal via Mercado Pago. Cancelamento a qualquer momento. Arrependimento em até 7 dias da primeira cobrança com reembolso integral.
        </p>
      </section>

      <section aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-bold tracking-tight">Perguntas frequentes</h2>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {FAQ.map(([q, a], i) => (
            <div key={q}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-semibold" aria-expanded={open === i}>
                {q}
                <span className="text-muted-foreground">{open === i ? "−" : "+"}</span>
              </button>
              {open === i ? <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-muted-foreground">{a}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 text-center">
        <ShieldCheck className="mx-auto h-6 w-6 text-primary" aria-hidden />
        <h2 className="mt-2 text-xl font-bold">Teste todas as ferramentas por {trial} dias</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Sem cartão, sem chaves de API.</p>
        <Link href="/registro?next=/" className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110">
          Criar conta
        </Link>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login?next=/" className="text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </section>
    </div>
  );
}
