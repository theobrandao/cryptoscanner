"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Activity, Bot, CandlestickChart, Check, FlaskConical, Gauge, Layers, Radar, ShieldCheck, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

interface Prices {
  prices: { PRO: number; ELITE: number };
  trialDays: number;
  checkoutEnabled: boolean;
  limits: Record<"PRO" | "ELITE", { alerts: number; monitors: number; strategies: number; historyDays: number }>;
}

const FEATURES = [
  { icon: CandlestickChart, title: "Dashboard de contexto", text: "Gráfico com estrutura (HH/HL, BOS, CHoCH), liquidez, suporte e resistência, EMAs, RSI, MACD, ATR e VWAP no mesmo contexto de ativo, exchange e timeframe." },
  { icon: Gauge, title: "Confluence Score auditável", text: "Oito componentes com pesos fixos somando 100, penalidades listadas e a conta exibida: bruto, penalidades e nota final. Mede qualidade da confluência, não probabilidade." },
  { icon: Layers, title: "Binance, Bybit e OKX", text: "Spot e perpétuo. Funding, próximo funding, open interest, basis e CVD aproximado por exchange, com a fonte e o horário de cada número." },
  { icon: Radar, title: "Market Scanner", text: "30 ativos por estado do setup, score, regime, R:R e distância da zona. Filtros combináveis e estratégia salva como filtro." },
  { icon: Activity, title: "Market Monitor no servidor", text: "Monitores de setup e de estratégia avaliados a cada ciclo, com o navegador fechado. Cada fato notifica uma vez: in-app, push e Telegram." },
  { icon: Workflow, title: "Strategy Builder multi-timeframe", text: "Regras AND/OR com timeframe por condição. A mesma estratégia roda no scanner, no monitor e no backtest." },
  { icon: FlaskConical, title: "Backtest com custos", text: "Walk-forward causal com taxas, slippage, funding e atraso de entrada. Curva de capital, drawdown e métricas em R líquido." },
  { icon: Bot, title: "AI Analyst verificado", text: "Resumo do contexto exibido. Interpretação com número fora do contexto é descartada antes de chegar a você." },
];

const WEIGHTS = [
  ["Market Structure", 20],
  ["Liquidity", 15],
  ["HTF Alignment", 15],
  ["Volume", 10],
  ["Momentum", 10],
  ["Derivatives", 10],
  ["Historical Performance", 10],
  ["Risk Quality", 10],
] as const;

const FAQ = [
  ["O CryptoScanner recomenda compra ou venda?", "Não. A plataforma calcula e organiza leitura técnica com regras determinísticas e mostra de onde vem cada número. A decisão é sua. Não é recomendação de investimento."],
  ["Preciso conectar minha corretora ou informar chaves de API?", "Não. Usamos apenas dados públicos de mercado. O CryptoScanner nunca pede chaves de API nem executa ordens."],
  ["O teste de 7 dias pede cartão?", "Não. O teste libera as funções do PRO por 7 dias. Ao final, o acesso é pausado até você escolher um plano; seus dados ficam salvos."],
  ["Como cancelo?", "Em Plans & Billing, a qualquer momento, sem multa. O acesso segue até o fim do período pago. Na primeira contratação, o pedido em até 7 dias garante reembolso integral."],
  ["Backtest positivo garante resultado?", "Não. O backtest é uma simulação sobre o passado, com custos e sem olhar dados futuros. O próprio sistema mostra quando a amostra é pequena ou a expectativa é negativa."],
  ["Com que frequência os dados atualizam?", "Preços por stream ou a cada poucos segundos; o contexto do Dashboard a cada 30 segundos; monitores a cada ciclo do servidor (5 minutos). O estado de cada dado aparece na tela: LIVE, DELAYED, DEGRADED, FALLBACK ou OFFLINE."],
  ["Funciona no celular?", "Sim. O workspace é responsivo e os avisos chegam por push no navegador e pelo Telegram."],
] as const;

export function Landing() {
  const { data } = useSWR<Prices>("/api/billing/prices", { revalidateOnFocus: false });
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-4 py-10 sm:py-14">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="text-[13px] font-semibold text-primary">Crypto Market Intelligence</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-[42px] sm:leading-[1.1]">Contexto de mercado cripto completo, em um único workspace.</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Estrutura, liquidez, suporte e resistência, derivativos de Binance, Bybit e OKX, Confluence Score com a conta aberta, monitores no servidor e backtest com custos. Cada número com fonte e horário.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/registro?next=/" className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110">
              Começar teste de {data?.trialDays ?? 7} dias
            </Link>
            <Link href="#planos" className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold hover:bg-muted">
              Ver planos
            </Link>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">Sem cartão no teste. Sem chaves de API. Cancele quando quiser.</p>
        </div>
        <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/dashboard.jpg" alt="Dashboard do CryptoScanner com gráfico, estrutura de mercado, liquidez e Confluence Score" width={1600} height={1000} className="h-auto w-full" />
          <figcaption className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">Captura da aplicação com dados reais do momento da captura.</figcaption>
        </figure>
      </section>

      <section aria-labelledby="features">
        <h2 id="features" className="text-2xl font-bold tracking-tight">O que você tem no workspace</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-4">
              <f.icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2" aria-labelledby="score">
        <div>
          <h2 id="score" className="text-2xl font-bold tracking-tight">Um score que fecha a conta</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            O Confluence Score soma oito componentes com pesos fixos. Evidência contrária entra como penalidade listada item a item. Componente sem dado vale zero. A tela mostra bruto, penalidades e nota final, e o motivo de cada ponto.
          </p>
          <ul className="mt-4 space-y-1.5 text-[13.5px]">
            {["Faixas: Low < 40 ≤ Moderate < 60 ≤ Good < 75 ≤ Strong < 90 ≤ Exceptional", "NO TRADE explícito: sem direção, R:R abaixo de 1, dados atrasados ou timeframes fortemente contra", "Histórico do próprio setup com amostra, expectativa em R e aviso de amostra pequena"].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          {WEIGHTS.map(([k, w]) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,2fr)_40px] items-center gap-3 py-1.5 text-[13px]">
              <span className="truncate text-muted-foreground">{k}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(w / 20) * 100}%` }} />
              </span>
              <span className="tabular text-right font-semibold">{w}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-[13px] font-semibold">
            <span>Total</span>
            <span className="tabular">100</span>
          </div>
        </div>
      </section>

      <section id="planos" aria-labelledby="pricing" className="scroll-mt-20">
        <h2 id="pricing" className="text-2xl font-bold tracking-tight">Planos</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">Comece com {data?.trialDays ?? 7} dias de teste completo. Depois, escolha o plano.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(["PRO", "ELITE"] as const).map((p) => {
            const l = data?.limits[p];
            const items =
              p === "PRO"
                ? [
                    "Dashboard, Scanner e Derivatives completos",
                    "Binance, Bybit e OKX · spot e perpétuo · 1m a 1W",
                    `${l?.monitors ?? "—"} monitores no servidor · ${l?.alerts ?? "—"} alertas`,
                    `${l?.strategies ?? "—"} estratégias · backtest de 1 timeframe`,
                    `${l ? Math.round(l.historyDays / 30) : "—"} meses de histórico no backtest`,
                    "AI Analyst: 100 consultas/dia",
                  ]
                : [
                    "Tudo do PRO",
                    "Backtest multi-timeframe",
                    `${l ? Math.round(l.historyDays / 365) : "—"} anos de histórico no backtest`,
                    `${l?.monitors ?? "—"} monitores · ${l?.alerts ?? "—"} alertas · ${l?.strategies ?? "—"} estratégias`,
                    "AI Analyst: 500 consultas/dia",
                  ];
            return (
              <div key={p} className={cn("flex flex-col rounded-xl border bg-card p-5", p === "ELITE" ? "border-primary/40" : "border-border")}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{p}</h3>
                  {p === "PRO" ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Mais escolhido</span> : null}
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
                  Começar teste de {data?.trialDays ?? 7} dias
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
        <h2 className="mt-2 text-xl font-bold">Teste o workspace por {data?.trialDays ?? 7} dias</h2>
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
