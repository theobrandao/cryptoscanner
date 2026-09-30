"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Calculator, Check, ShieldCheck, Signal } from "lucide-react";
import { MarketStrip, MoversCard, NewsCard } from "@/components/market/market-now";
import { Chip, Eyebrow, LineChart, PillGroup, SectionHeading, StatTile, TickerMarquee, ToolsGrid } from "@/components/ui/showcase";
import { fmtR, ValidatedModels } from "@/components/marketing/validated-models";
import { billingNote, PLAN_FEATURES, type BillingProvider } from "@/lib/plans-copy";
import { postJson } from "@/lib/client-api";
import { trackClient } from "@/lib/analytics-client";
import { useSession } from "@/hooks/use-session";
import { MAIN_TOOLS, TOOL_CATEGORIES } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { captureAffiliateParams, withAffiliateParams } from "@/lib/affiliate-params";

export interface Prices {
  prices: { PRO: number; ELITE: number };
  trialDays: number;
  checkoutEnabled: boolean;
  provider: BillingProvider;
  checkoutUrls: { PRO: string | null; ELITE: string | null } | null;
}

type Level = "iniciante" | "intermediario" | "avancado";

/** Dados estáticos vindos do servidor (evita levar zod e o conteúdo das aulas para o bundle da página de venda). */
export interface LandingData {
  validated: Array<{
    name: string;
    description: string;
    tf: string;
    validation: { label: string; summary: string; caveats: string; metrics: { period: string; trades: number; expectancyR: number; profitFactor: number; winPct: number; assetsPositive: number; assetsTotal: number } };
    /** R acumulado fora da amostra, em ordem de saída */
    curve: number[];
  }>;
  lessons: Array<{ title: string; level: Level; minutes: number; summary: string }>;
  patterns: number;
  assets: number;
}

const LEVELS: Array<{ key: Level; label: string; tone: string; text: string }> = [
  { key: "iniciante", label: "Iniciante", tone: "bg-success/15 text-success", text: "Bitcoin, candles, suportes e médias móveis." },
  { key: "intermediario", label: "Intermediário", tone: "bg-warning/15 text-warning", text: "Indicadores, padrões do scanner, Fibonacci e gestão de risco." },
  { key: "avancado", label: "Avançado", tone: "bg-danger/15 text-danger", text: "Derivativos, automação com agentes, psicologia e backtests." },
];

const faq = (trial: number) => [
  ["O CryptoScanner recomenda compra ou venda?", "Não. As ferramentas calculam padrões, níveis e sinais com regras fixas e mostram de onde vem cada número. A decisão é sua. Não é recomendação de investimento."],
  ["O que quer dizer \"testado fora da amostra\"?", "As regras do modelo foram escolhidas com dados de um período e medidas em outro período, que não foi usado na escolha. Só publicamos o modelo porque o resultado nesse segundo período foi positivo, já descontando taxa e slippage. O setup que não passou nesse teste não é vendido como estratégia."],
  ["Preciso conectar minha corretora ou informar chaves de API?", "Não. Usamos apenas dados públicos de mercado. O CryptoScanner nunca pede chaves de API nem executa ordens."],
  ["O teste grátis pede cartão?", `Não. O teste libera as funções do PRO por ${trial} dias (o ELITE não tem teste). Ao final, o acesso é pausado até você escolher um plano; seus dados ficam salvos.`],
  ["Como cancelo?", "A qualquer momento, sem multa. O acesso segue até o fim do período pago. Na primeira contratação, o pedido em até 7 dias garante reembolso integral."],
  ["Funciona no celular?", "Sim. O site é responsivo e os avisos chegam por push no navegador e pelo Telegram."],
] as const;

/** Perguntas frequentes com todas as respostas no HTML (details/summary); a primeira começa aberta. */
export function FaqList({ items, compact }: { items: ReadonlyArray<readonly [string, string]>; compact?: boolean }) {
  return (
    <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map(([q, a], i) => (
        <details key={q} open={i === 0} className="group">
          <summary className={cn("flex w-full cursor-pointer list-none items-center justify-between gap-3 text-left text-[14px] font-semibold [&::-webkit-details-marker]:hidden", compact ? "min-h-[52px] px-4 py-3 sm:px-5" : "px-5 py-4")}>
            <span className="min-w-0">{q}</span>
            <span className="shrink-0 text-muted-foreground" aria-hidden>
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <p className={cn("pb-4 text-[13.5px] leading-relaxed text-muted-foreground", compact ? "px-4 sm:px-5" : "px-5")}>{a}</p>
        </details>
      ))}
    </div>
  );
}

export type CtaOrigin = "hero" | "cartao_ferramenta" | "rodape" | "fixo_celular" | "final";

/** Registra o clique em chamada para o teste, com a origem (best-effort). */
export const trackCta = (origin: CtaOrigin) => () => trackClient("cta_click", { origin });

/** Registra o clique em qualquer link dentro do bloco (cartões de ferramenta). */
export const trackCtaInside = (origin: CtaOrigin) => (e: React.MouseEvent) => {
  if ((e.target as Element | null)?.closest?.("a")) trackClient("cta_click", { origin });
};

/** CTA fixo no rodapé do celular. `above` sobe o botão acima da barra de navegação do app (h-14). */
export function StickyTrialCta({ trial, href, visible = true, above, testId }: { trial: number; href: string; visible?: boolean; above?: boolean; testId: string }) {
  return (
    <div
      className={cn("fixed inset-x-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur transition-transform lg:hidden", above ? "bottom-14" : "bottom-0", !visible && "pointer-events-none translate-y-[200%]")}
      style={above ? undefined : { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-hidden={visible ? undefined : true}
    >
      <Link href={href} data-testid={testId} tabIndex={visible ? undefined : -1} onClick={trackCta("fixo_celular")} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
        Testar o PRO grátis por {trial} dias <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

interface SimResult {
  result: { totalInvested: number; finalValue: number; profitPct: number; maxDrawdownPct: number; startDate: number; endDate: number; curve: Array<{ time: number; invested: number; value: number }> };
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/** Simulador de aportes (API pública, não salva nada): pílulas, controle deslizante e curva. */
export function Simulator() {
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
      const body = { symbol, strategy, currency: "BRL", initialCapital: strategy === "dca" ? 0 : amount, monthlyContribution: strategy === "dca" ? amount : 0, months, riskProfile: "arrojado" };
      setRes((await postJson<SimResult>("/api/simulations/run", body)).result);
    } catch (e) {
      setErr((e as Error).message || "Falha na simulação");
    } finally {
      setBusy(false);
    }
  };
  const label = "mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="card-glow flex flex-col gap-4 rounded-2xl border border-border p-5">
        <div>
          <span className={label}>Ativo</span>
          <PillGroup label="Ativo" value={symbol} onChange={setSymbol} options={[{ value: "BTC", label: "₿ Bitcoin" }, { value: "ETH", label: "Ξ Ethereum" }, { value: "SOL", label: "◎ Solana" }, { value: "BNB", label: "⬡ BNB" }]} />
        </div>
        <div>
          <span className={label}>Forma de aporte</span>
          <PillGroup label="Forma de aporte" value={strategy} onChange={setStrategy} options={[{ value: "dca", label: "Mensal (DCA)" }, { value: "lump_sum", label: "Aporte único" }]} />
        </div>
        <div>
          <label htmlFor="sim-amount" className={label}>
            {strategy === "dca" ? "Valor por mês" : "Valor"}: <span className="text-foreground">{brl(amount)}</span>
          </label>
          <input id="sim-amount" type="range" min={100} max={strategy === "dca" ? 5000 : 50000} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
        </div>
        <div>
          <span className={label}>Período</span>
          <PillGroup label="Período" value={months} onChange={setMonths} options={[6, 12, 24, 36].map((m) => ({ value: m as 6 | 12 | 24 | 36, label: m < 12 ? `${m} meses` : `${m / 12} ${m === 12 ? "ano" : "anos"}` }))} />
        </div>
        <button onClick={() => void run()} disabled={busy} className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
          {busy ? "Calculando…" : "Simular com preços reais"} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" aria-live="polite">
        {err ? <p className="text-[13px] text-danger">{err}</p> : null}
        {res ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Investido" value={brl(res.totalInvested)} className="px-3" />
              <StatTile label="Valor final" value={brl(res.finalValue)} className="px-3" />
              <StatTile label="Resultado" value={`${res.profitPct >= 0 ? "+" : ""}${res.profitPct.toFixed(1)}%`} tone={res.profitPct >= 0 ? "up" : "down"} className="px-3" />
              <StatTile label="Maior queda" value={`−${res.maxDrawdownPct.toFixed(1)}%`} tone="down" className="px-3" />
            </div>
            <LineChart values={res.curve.map((p) => p.value)} compare={res.curve.map((p) => p.invested)} height={170} tone={res.profitPct >= 0 ? "up" : "down"} label="Patrimônio simulado e total aportado" />
            <div className="flex gap-4 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-0.5 w-4", res.profitPct >= 0 ? "bg-success" : "bg-danger")} /> Patrimônio
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-muted-foreground" /> Total aportado
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {new Date(res.startDate).toLocaleDateString("pt-BR")} a {new Date(res.endDate).toLocaleDateString("pt-BR")} · fechamentos diários reais convertidos pelo câmbio de cada dia · simulação histórica, não projeção.
            </p>
          </>
        ) : !err ? (
          <div className="grid flex-1 place-items-center text-center text-[13.5px] text-muted-foreground">
            <div>
              <Calculator className="mx-auto mb-2 h-7 w-7 text-primary" />
              Escolha o ativo, a forma de aporte, o valor e o período.
              <br />O resultado aparece aqui, com a curva do patrimônio.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Cartões PRO/ELITE: PRO com teste grátis; compra direta pelo link da Kiwify quando o checkout está liberado. */
export function PlanCards({ data, trial }: { data: Prices | undefined; trial: number }) {
  const { user, loading } = useSession();
  return (
    <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
      {(["PRO", "ELITE"] as const).map((p) => {
        const buy = data?.checkoutUrls?.[p] ?? null;
        return (
          <div key={p} className={cn("flex min-w-0 flex-col rounded-2xl border p-5 sm:p-6", p === "ELITE" ? "card-glow border-primary/50" : "border-border bg-card")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-extrabold tracking-tight">{p}</h3>
              {p === "PRO" ? <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">{trial} dias grátis</span> : <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Mais recursos</span>}
            </div>
            <div className="mt-2">
              <span className="tabular text-4xl font-extrabold">{data ? `R$ ${data.prices[p]}` : "—"}</span>
              <span className="text-sm text-muted-foreground"> /mês</span>
            </div>
            <ul className="mt-5 flex flex-1 flex-col gap-2 text-[13.5px]">
              {PLAN_FEATURES[p].map((i) => (
                <li key={i} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span className="min-w-0">{i}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              {p === "PRO" ? (
                <Link href="/registro?next=/" className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:brightness-110">
                  Começar {trial} dias grátis
                </Link>
              ) : null}
              {!data ? (
                <div className="skeleton h-12 rounded-xl" aria-hidden="true" />
              ) : buy ? (
                <a href={buy} rel="noopener" data-testid={`buy-${p}`} onClick={(e) => (e.currentTarget.href = withAffiliateParams(buy))} className={cn("flex h-12 items-center justify-center rounded-xl text-sm font-semibold", p === "ELITE" ? "bg-primary text-primary-foreground hover:brightness-110" : "border border-border hover:border-primary/50")}>
                  Assinar {p} agora
                </a>
              ) : p === "ELITE" ? (
                <Link href="/registro?next=/planos" className="flex h-12 items-center justify-center rounded-xl border border-border text-sm font-semibold hover:border-primary/50">
                  Criar conta e assinar o ELITE
                </Link>
              ) : null}
              {buy && !user && !loading ? <p className="text-center text-[12px] text-muted-foreground">Use no checkout o mesmo e-mail do cadastro.</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Landing({ content }: { content: LandingData }) {
  React.useEffect(() => captureAffiliateParams(window.location.search), []);
  const { data } = useSWR<Prices>("/api/billing/prices", { revalidateOnFocus: false });
  const trial = data?.trialDays ?? 3;
  const FAQ = faq(trial);
  const main = content.validated[0];
  // CTA fixo do celular aparece depois que o botão do topo sai da tela
  const heroRef = React.useRef<HTMLElement>(null);
  const [pastHero, setPastHero] = React.useState(false);
  React.useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e) setPastHero(!e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="flex w-full flex-col pb-20 lg:pb-0">
      <TickerMarquee />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-20 px-4 py-12 sm:py-16">
        {/* HERO */}
        <section ref={heroRef} className="flex flex-col items-center text-center">
          <Eyebrow tone="warning">Modelo testado fora da amostra</Eyebrow>
          <h1 className="mt-5 max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Cripto com ferramentas claras e <span className="text-gradient">sinais testados</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
            Scanner de padrões gráficos, agentes que avisam no celular, Sentinela 24h, gráficos, Fibonacci, simulador e aulas. Cada ferramenta faz uma coisa, e o modelo de sinais mostra o resultado medido em um período que não foi usado para criá-lo.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Link href="/registro?next=/" onClick={trackCta("hero")} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110">
              Testar o PRO grátis por {trial} dias <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#modelo" className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-left hover:border-primary/50">
              <Signal className="h-5 w-5 text-primary" />
              <span className="leading-tight">
                <span className="block text-[13px] font-semibold">Sinais do modelo</span>
                <span className="block text-[11px] text-muted-foreground">números fora da amostra</span>
              </span>
            </a>
            <a href="#simulador" className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-left hover:border-primary/50">
              <Calculator className="h-5 w-5 text-primary" />
              <span className="leading-tight">
                <span className="block text-[13px] font-semibold">Simulador</span>
                <span className="block text-[11px] text-muted-foreground">grátis, sem cadastro</span>
              </span>
            </a>
          </div>
          <dl className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              [String(content.assets), "ativos monitorados"],
              [String(content.patterns), "padrões gráficos"],
              [String(content.lessons.length), "aulas"],
              [main ? fmtR(main.validation.metrics.expectancyR) : "—", `por operação fora da amostra (${main?.tf ?? ""})`],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="text-gradient text-3xl font-extrabold tabular-nums sm:text-4xl">{v}</dd>
                <dd className="mt-1 text-[12px] text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </section>

        <MarketStrip />

        {/* FERRAMENTAS */}
        <section id="ferramentas" className="scroll-mt-20" aria-label="Ferramentas">
          <SectionHeading eyebrow="Ferramentas" title="Uma ferramenta para" accent="cada tarefa" subtitle="Organizadas pelo que você quer fazer. As análises profundas ficam separadas, no grupo Avançado." />
          <div className="mt-10" onClickCapture={trackCtaInside("cartao_ferramenta")}>
            <ToolsGrid tools={MAIN_TOOLS.filter((t) => t.href !== "/")} categories={TOOL_CATEGORIES} hrefFor={(t) => `/registro?next=${encodeURIComponent(t.href)}`} ctaFor={() => "Testar grátis"} />
          </div>
        </section>

        {/* MERCADO + NOTÍCIAS */}
        <section aria-label="Mercado agora">
          <SectionHeading eyebrow="Ao vivo" title="O mercado" accent="agora" subtitle="Preços em tempo real dos ativos monitorados e as manchetes do dia, com fonte e horário." />
          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <MoversCard />
            <NewsCard />
          </div>
        </section>

        {/* MODELO */}
        <section id="modelo" className="scroll-mt-20" aria-label="Modelo validado">
          <SectionHeading
            eyebrow="Modelo de sinais"
            tone="warning"
            title="Resultado medido"
            accent="fora da amostra"
            subtitle="Regras escolhidas em um período e medidas em outro, já descontando taxa e slippage, em 30 criptos. O setup de pullback que testamos junto não passou e por isso não é oferecido como estratégia."
          />
          <div className="mt-8">
            <ValidatedModels models={content.validated} />
          </div>
        </section>

        {/* SIMULADOR */}
        <section id="simulador" className="scroll-mt-20" aria-label="Simulador de aportes">
          <SectionHeading eyebrow="Simulador" title="Quanto teria rendido" accent="aportar em cripto" subtitle="Escolha o ativo, a forma e o período. O cálculo usa os preços diários reais do período." />
          <div className="mt-8">
            <Simulator />
          </div>
        </section>

        {/* JORNADA */}
        <section aria-label="Jornada">
          <SectionHeading eyebrow="Jornada" title="Aprenda antes de" accent="operar" subtitle={`${content.lessons.length} aulas curtas com teste e prática dentro do próprio app. O progresso fica salvo na sua conta.`} />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {LEVELS.map((lv) => {
              const list = content.lessons.filter((l) => l.level === lv.key);
              return (
                <article key={lv.key} className="card-glow flex flex-col gap-3 rounded-2xl border border-border p-5">
                  <span className={cn("self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", lv.tone)}>{lv.label}</span>
                  <p className="text-[13px] text-muted-foreground">{lv.text}</p>
                  <ol className="flex flex-col gap-1.5 text-[13px]">
                    {list.map((l) => (
                      <li key={l.title} className="flex items-start justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                        <span>{l.title}</span>
                        <span className="tabular shrink-0 text-[11px] text-muted-foreground">{l.minutes} min</span>
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })}
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" aria-label="Planos" className="scroll-mt-20">
          <SectionHeading eyebrow="Planos" title="Teste o PRO" accent={`${trial} dias grátis`} subtitle="Sem cartão no teste. Depois, escolha o plano." />
          <PlanCards data={data} trial={trial} />
          <p className="mx-auto mt-3 max-w-4xl text-center text-[12px] leading-relaxed text-muted-foreground">{billingNote(data?.provider ?? "mercadopago")}</p>
        </section>

        {/* FAQ */}
        <section id="faq" aria-label="Perguntas frequentes" className="mx-auto w-full max-w-3xl scroll-mt-20">
          <SectionHeading eyebrow="Dúvidas" title="Perguntas" accent="frequentes" />
          <FaqList items={FAQ} />
        </section>

        <section className="card-glow rounded-3xl border border-border p-8 text-center sm:p-12">
          <ShieldCheck className="mx-auto h-7 w-7 text-primary" aria-hidden />
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Teste o PRO por <span className="text-gradient">{trial} dias grátis</span>
          </h2>
          <p className="mt-2 text-[14px] text-muted-foreground">Sem cartão, sem chaves de API.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {["Scanner", "Agentes IA", "Sentinela", "Sinais do modelo", "Simulador", "Jornada"].map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
          <Link href="/registro?next=/" onClick={trackCta("final")} className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110">
            Testar o PRO grátis por {trial} dias <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login?next=/" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </section>
      </div>

      {/* CTA fixo no celular (acima da navegação inferior do app) */}
      <StickyTrialCta trial={trial} href="/registro?next=/" visible={pastHero} above testId="landing-sticky-cta" />
    </div>
  );
}
