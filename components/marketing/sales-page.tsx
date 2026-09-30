"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import Image from "next/image";
import { ArrowRight, BellRing, Bot, Check, CircleSlash, ListChecks, ScrollText, ShieldCheck, Smartphone, Target, UserPlus, X } from "lucide-react";
import { FaqList, PlanCards, StickyTrialCta, trackCta, trackCtaInside, type LandingData, type Prices } from "@/components/marketing/landing";
import { fmtR, ValidatedModels } from "@/components/marketing/validated-models";
import { Eyebrow, LineChart, SectionHeading, StatTile, TickerMarquee, ToolsGrid } from "@/components/ui/showcase";
import { billingNote } from "@/lib/plans-copy";
import { captureAffiliateParams } from "@/lib/affiliate-params";
import { ENTITLEMENTS } from "@/lib/entitlements";
import { MAIN_TOOLS, TOOL_CATEGORIES } from "@/lib/tools";

/**
 * Página de vendas (/vendas): destino dos anúncios e URL da página de vendas na Kiwify.
 * Só números verificáveis (modelo validado, contagens do catálogo); sem depoimentos nem promessa de resultado.
 */

const BENEFITS = [
  { icon: BellRing, title: "Alertas no lugar de horas de tela", text: "Agentes IA e Sentinela vigiam os ativos 24h no servidor e avisam por push e Telegram quando a condição escolhida aparece." },
  { icon: ScrollText, title: "Regras fixas e auditáveis", text: "O scanner calcula padrões, alvo, stop e taxa de acerto histórica por regra. Cada número mostra a fonte e o horário do dado." },
  { icon: Target, title: "Modelo medido fora da amostra", text: "O modelo de rompimento foi publicado porque o resultado em um período não usado na escolha das regras foi positivo, já com taxa e slippage." },
  { icon: Bot, title: "Analista IA com os números do app", text: "Pergunte sobre qualquer um dos 30 ativos. A IA consulta as ferramentas do CryptoScanner e só escreve números que vieram delas." },
];

const SCREENS = [
  { src: "/marketing/analise-completa.webp", title: "Análise completa", text: "Gráfico com estrutura (BOS, CHoCH), liquidez, zona de entrada, stop e alvos calculados, derivativos e Confluence Score auditável." },
  { src: "/marketing/scanner-padroes.webp", title: "Scanner de padrões", text: "Os 30 ativos lado a lado: tendência, momento, volume relativo, volatilidade e o padrão gráfico em formação em cada um." },
];

const STEPS = [
  { icon: UserPlus, title: "Crie a conta", text: "O PRO fica liberado por alguns dias, sem cartão. Seus dados e configurações ficam salvos." },
  { icon: ListChecks, title: "Escolha ativos e regras", text: "Ative agentes, Sentinela e alertas de preço nos ativos que você acompanha e ligue push ou Telegram." },
  { icon: Smartphone, title: "Receba e confira", text: "Cada aviso traz o ativo, o padrão e os níveis calculados. A análise está no app; a decisão é sua." },
];

const FOR_WHO = {
  yes: ["Quem opera ou investe em cripto e quer regras claras em vez de opinião", "Quem não pode acompanhar gráfico o dia inteiro e prefere ser avisado", "Quem quer aprender análise técnica com prática (12 aulas com teste)"],
  no: ["Quem procura promessa de lucro garantido", "Quem quer que alguém opere por você: o app não executa ordens nem pede chaves da corretora", "Quem não aceita risco de perda: cripto tem alta volatilidade"],
};

function faq(trial: number, kiwify: boolean): Array<[string, string]> {
  return [
    [
      "Como recebo o acesso depois de comprar?",
      kiwify
        ? "Crie a conta (ou entre) com o mesmo e-mail usado no checkout da Kiwify. O plano é liberado automaticamente quando o pagamento é confirmado; se você comprou antes de criar a conta, o acesso entra no momento do cadastro."
        : "Assine pela página Planos, dentro da sua conta. O plano é liberado automaticamente quando o pagamento é confirmado.",
    ],
    ["O teste grátis vale para qual plano?", `Para o PRO, por ${trial} dias, sem cartão. O ELITE não tem teste. Ao final do teste, o acesso é pausado até você escolher um plano; nada é cobrado automaticamente.`],
    ["O CryptoScanner recomenda compra ou venda?", "Não. As ferramentas calculam padrões, níveis e sinais com regras fixas e mostram de onde vem cada número. A decisão é sua. Não é recomendação de investimento."],
    ["Os resultados do modelo são garantidos?", "Não. Os números são históricos, medidos em um período fora da amostra e descontando custos. Resultado passado não garante resultado futuro."],
    ["Preciso conectar minha corretora?", "Não. O CryptoScanner usa apenas dados públicos de mercado, nunca pede chaves de API e não executa ordens."],
    ["Funciona no celular?", "Sim. O site se adapta a qualquer tela e os avisos chegam por push no navegador e pelo Telegram."],
    [
      "Como cancelo? E a garantia?",
      kiwify
        ? "Cancele a qualquer momento pelos canais da Kiwify indicados no e-mail da compra ou pelo nosso suporte; o acesso segue até o fim do período pago. Pedido em até 7 dias da compra: reembolso integral."
        : "Cancele a qualquer momento em Planos; o acesso segue até o fim do período pago. Pedido em até 7 dias da primeira cobrança: reembolso integral.",
    ],
  ];
}

export function SalesPage({ content, initialPrices }: { content: LandingData; initialPrices?: Prices }) {
  // valor do servidor (canal de venda, preços) já no HTML: a FAQ da Kiwify não depende do carregamento no navegador
  const { data } = useSWR<Prices>("/api/billing/prices", { revalidateOnFocus: false, fallbackData: initialPrices });
  const trial = data?.trialDays ?? 3;
  const kiwify = data?.provider === "kiwify";
  const main = content.validated[0];
  const m = main?.validation.metrics;
  const FAQ = faq(trial, kiwify);
  const cta = "/registro?next=/";
  const t = ENTITLEMENTS.TRIAL;
  React.useEffect(() => captureAffiliateParams(window.location.search), []);
  return (
    <div className="flex w-full flex-col pb-20 lg:pb-0">
      <TickerMarquee />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-4 py-10 sm:gap-20 sm:py-14">
        {/* HERO */}
        <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex min-w-0 flex-col items-start">
            <Eyebrow tone="warning">Scanner · sinais testados · alertas no celular</Eyebrow>
            <h1 className="mt-5 text-balance text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[56px]">
              Padrões, sinais testados e alertas de <span className="text-gradient">{content.assets} criptos</span> em um só lugar
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
              O CryptoScanner calcula por regras fixas os padrões gráficos, os níveis e os sinais do modelo de rompimento, e avisa no celular quando a condição aparece. Você vê de onde vem cada número e decide.
            </p>
            <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
              <Link href={cta} onClick={trackCta("hero")} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110">
                Testar o PRO grátis por {trial} dias <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#planos" className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-6 text-sm font-semibold hover:border-primary/50">
                Ver planos e preços
              </a>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              {["Sem cartão no teste", "Sem chaves da corretora", "7 dias de garantia na compra"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-success" /> {t}
                </li>
              ))}
            </ul>
          </div>
          {main && m ? (
            <aside className="card-glow flex min-w-0 flex-col gap-4 rounded-2xl border border-border p-4 sm:p-5" aria-label="Resultado do modelo fora da amostra">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">Modelo de rompimento {main.tf}</span>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">fora da amostra</span>
              </div>
              <LineChart values={main.curve} height={150} tone="up" label="R acumulado fora da amostra" />
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Operações" value={m.trades} className="px-2.5" />
                <StatTile label="Por operação" value={fmtR(m.expectancyR)} tone="up" className="px-2.5" />
                <StatTile label="Fator de lucro" value={m.profitFactor.toFixed(2).replace(".", ",")} className="px-2.5" />
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {m.period}, {m.assetsTotal} criptos, líquido de taxa e slippage. R = múltiplos do risco por operação. Histórico não garante resultado futuro.
              </p>
            </aside>
          ) : null}
        </section>

        {/* NÚMEROS */}
        <section aria-label="Números" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Ativos monitorados" value={content.assets} tone="accent" />
          <StatTile label="Padrões gráficos" value={content.patterns} tone="accent" />
          <StatTile label="Aulas com teste" value={content.lessons.length} tone="accent" />
          <StatTile label="Operações medidas" value={m?.trades ?? "—"} sub="fora da amostra (4H)" tone="accent" />
        </section>

        {/* POR DENTRO */}
        <section aria-label="Telas do aplicativo">
          <SectionHeading eyebrow="Por dentro" title="Veja o app" accent="funcionando" subtitle="Telas reais do CryptoScanner, capturadas com dados de mercado do momento." />
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {SCREENS.map((sc) => (
              <figure key={sc.src} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
                <Image src={sc.src} alt={`Tela ${sc.title} do CryptoScanner`} width={1280} height={800} sizes="(min-width: 1024px) 600px, 100vw" className="h-auto w-full border-b border-border" />
                <figcaption className="p-4">
                  <h3 className="text-[15px] font-bold">{sc.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{sc.text}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* BENEFÍCIOS */}
        <section aria-label="Benefícios">
          <SectionHeading eyebrow="Por que usar" title="Menos tempo na tela," accent="mais critério" subtitle="O trabalho repetitivo de olhar gráfico fica com o servidor. Você recebe o aviso e confere os números." />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <article key={b.title} className="card-glow flex flex-col gap-3 rounded-2xl border border-border p-5">
                <span className="icon-tile grid h-11 w-11 place-items-center rounded-xl">
                  <b.icon className="h-5 w-5" />
                </span>
                <h3 className="text-[16px] font-bold">{b.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">{b.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* FERRAMENTAS */}
        <section id="ferramentas" className="scroll-mt-20" aria-label="Ferramentas incluídas">
          <SectionHeading eyebrow="Incluído no PRO" title="Tudo o que você" accent="recebe" subtitle="Uma ferramenta para cada tarefa, organizadas pelo que você quer fazer." />
          <div className="mt-8" onClickCapture={trackCtaInside("cartao_ferramenta")}>
            <ToolsGrid tools={MAIN_TOOLS.filter((t) => t.href !== "/")} categories={TOOL_CATEGORIES} hrefFor={(t) => `/registro?next=${encodeURIComponent(t.href)}`} ctaFor={() => "Testar grátis"} />
          </div>
        </section>

        {/* MODELO */}
        <section id="modelo" className="scroll-mt-20" aria-label="Modelo validado">
          <SectionHeading eyebrow="Transparência" tone="warning" title="Os números do modelo," accent="com as ressalvas" subtitle="Regras escolhidas em um período e medidas em outro, em 30 criptos, descontando taxa e slippage. O setup que não passou nesse teste não é vendido como estratégia." />
          <div className="mt-8">
            <ValidatedModels models={content.validated} />
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section aria-label="Como funciona">
          <SectionHeading eyebrow="Como funciona" title="Três passos para" accent="começar" />
          <ol className="mt-8 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-[15px] font-extrabold text-primary">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-[15.5px] font-bold">
                    <s.icon className="h-4 w-4 text-primary" /> {s.title}
                  </h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{i === 0 ? `O PRO fica liberado por ${trial} dias, sem cartão. Seus dados e configurações ficam salvos.` : s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* PARA QUEM */}
        <section aria-labelledby="paraquem" className="grid gap-3 md:grid-cols-2">
          <h2 id="paraquem" className="sr-only">Para quem é</h2>
          <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
            <h3 className="text-[16px] font-bold text-success">É para você se…</h3>
            <ul className="mt-3 flex flex-col gap-2.5 text-[13.5px]">
              {FOR_WHO.yes.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span className="min-w-0">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
            <h3 className="text-[16px] font-bold text-danger">Não é para você se…</h3>
            <ul className="mt-3 flex flex-col gap-2.5 text-[13.5px]">
              {FOR_WHO.no.map((t) => (
                <li key={t} className="flex gap-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> <span className="min-w-0">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" aria-label="Planos e preços" className="scroll-mt-20">
          <SectionHeading eyebrow="Planos" title="Teste o PRO" accent={`${trial} dias grátis`} subtitle="Sem cartão no teste. Assinatura mensal, cancelamento a qualquer momento." />
          <PlanCards data={data} trial={trial} />
          <div className="mx-auto mt-4 flex max-w-4xl flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
            <ShieldCheck className="h-8 w-8 shrink-0 text-success" aria-hidden />
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold">Garantia de 7 dias</h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">Pediu o cancelamento em até 7 dias da compra, recebe o valor integral de volta (art. 49 do Código de Defesa do Consumidor).</p>
            </div>
          </div>
          <p className="mx-auto mt-3 max-w-4xl text-center text-[12px] leading-relaxed text-muted-foreground">
            No teste grátis: todas as ferramentas do PRO com {t.maxAlerts} alertas, {t.maxMonitors} monitor, {t.maxStrategies} estratégias e {t.aiQueriesPerDay} consultas ao Analista IA por dia. {billingNote(data?.provider ?? "mercadopago")}
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" aria-label="Perguntas frequentes" className="mx-auto w-full max-w-3xl scroll-mt-20">
          <SectionHeading eyebrow="Dúvidas" title="Perguntas" accent="frequentes" />
          <FaqList items={FAQ} compact />
        </section>

        {/* CTA FINAL */}
        <section className="card-glow rounded-3xl border border-border p-6 text-center sm:p-12">
          <h2 className="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl">
            Comece hoje com <span className="text-gradient">{trial} dias de PRO grátis</span>
          </h2>
          <p className="mt-2 text-[14px] text-muted-foreground">Sem cartão, sem chaves de API. Se gostar, escolha o plano.</p>
          <Link href={cta} onClick={trackCta("final")} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110 sm:w-auto">
            Criar conta grátis <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login?next=/planos" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </section>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Conteúdo técnico e educacional; não é recomendação de investimento. Criptoativos têm alta volatilidade e risco de perda do capital. Resultados históricos, inclusive fora da amostra, não garantem resultados futuros.
        </p>
      </div>

      {/* CTA fixo no celular */}
      <StickyTrialCta trial={trial} href={cta} testId="sales-sticky-cta" />
    </div>
  );
}
