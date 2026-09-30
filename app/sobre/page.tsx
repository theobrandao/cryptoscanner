import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, BookOpen, Check, Database, FileText, FlaskConical, LifeBuoy, Users } from "lucide-react";
import type { ReactNode } from "react";
import { FaqList } from "@/components/marketing/faq-list";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ABOUT_DOES_NOT, ABOUT_FOR_WHO, aboutDefinition, aboutFaq, DATA_SOURCES, INVESTMENT_DISCLAIMER } from "@/lib/content/about";
import { tutorialForPath } from "@/lib/content/tutorial-paths";
import { tutorialPath } from "@/lib/content/tutorials";
import { formatBRL, PLAN_FEATURES } from "@/lib/plans-copy";
import { aboutPageLd, breadcrumbLd, faqPageLd, JsonLd, organizationLd, softwareApplicationLd } from "@/lib/seo/json-ld";
import { llmsContext } from "@/lib/seo/llms";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { CONTENT_REVISED, PAGE_SEO } from "@/lib/seo/pages";
import { STRATEGY_TEMPLATES } from "@/lib/strategies/definition";
import { ADVANCED_TOOLS, MAIN_TOOLS } from "@/lib/tools";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.sobre);

/** Ferramentas sem entrada em tutorial-paths (Início e Jornada) → tutorial próprio. */
const EXTRA_TUTORIAL: Record<string, string> = { "/": "inicio", "/jornada": "jornada" };
const tutorialHref = (href: string) => tutorialForPath(href)?.href ?? (EXTRA_TUTORIAL[href] ? tutorialPath(EXTRA_TUTORIAL[href]) : null);

const dateBR = (iso: string) => iso.split("-").reverse().join("/");

function Section({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex scroll-mt-20 items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
        <span aria-hidden className="text-primary [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * "O que é o CryptoScanner" (estática, indexável): definição, público, o que faz e não faz, ferramentas com tutorial,
 * como o modelo foi testado, planos, fontes de dados, fornecedor e perguntas (FAQPage com os mesmos itens da página).
 * Só fatos do código e de .agents/product-marketing.md; dados do fornecedor ficam nos Termos (não repetidos aqui).
 */
export default function AboutPage() {
  const facts = llmsContext();
  const faq = aboutFaq(facts);
  const definition = aboutDefinition(facts);
  const models = STRATEGY_TEMPLATES.filter((t) => t.validation);
  const tools = [...MAIN_TOOLS, ...ADVANCED_TOOLS];
  return (
    <>
      <JsonLd data={[aboutPageLd(definition, CONTENT_REVISED), organizationLd(), softwareApplicationLd("/sobre"), faqPageLd(faq, "/sobre"), breadcrumbLd([["Início", "/"], ["O que é o CryptoScanner", "/sobre"]])]} />
      <PageShell>
        <article className="mx-auto flex w-full max-w-4xl flex-col gap-8" aria-labelledby="sobre-titulo">
          <div>
            <PageTitle title={<span id="sobre-titulo">O que é o CryptoScanner</span>} description={`Atualizado em ${dateBR(CONTENT_REVISED)}.`} />
            <p className="max-w-3xl text-[15px] leading-relaxed text-foreground/90">{definition}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/vendas" className={buttonVariants({ variant: "primary" })}>
                Conhecer o app <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/jornada" className={buttonVariants({ variant: "outline" })}>
                Jornada Trader grátis
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-5 sm:p-5">
                <Section id="para-quem" icon={<Users />} title="Para quem é">
                  <ul className="flex flex-col gap-2 text-sm">
                    {ABOUT_FOR_WHO.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> <span className="min-w-0">{x}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 sm:p-5">
                <Section id="o-que-nao-faz" icon={<Ban />} title="O que o CryptoScanner não faz">
                  <ul className="flex flex-col gap-2 text-sm">
                    {ABOUT_DOES_NOT.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> <span className="min-w-0">{x}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              </CardContent>
            </Card>
          </div>

          <Section id="recursos" icon={<BookOpen />} title="Recursos e tutoriais">
            <p className="text-sm text-muted-foreground">Cada ferramenta faz uma coisa. O link leva ao tutorial com o passo a passo.</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {tools.map((t) => {
                const href = tutorialHref(t.href);
                return (
                  <li key={t.href} className="rounded-lg border border-border bg-card p-3 text-sm">
                    {href ? (
                      <Link href={href} className="font-semibold text-primary-text hover:underline">
                        {t.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{t.name}</span>
                    )}
                    <p className="mt-0.5 text-muted-foreground">{t.purpose}</p>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="modelo" icon={<FlaskConical />} title="Como o modelo de sinais é testado">
            <p className="text-sm leading-relaxed text-muted-foreground">
              As regras do modelo de rompimento foram escolhidas com dados de um período e medidas em outro período, que não foi usado na escolha (teste fora da amostra), descontando taxa e slippage. O setup que não passou nesse teste não é oferecido como estratégia. Os gráficos e números completos estão na{" "}
              <Link href="/vendas#modelo" className="font-medium text-primary-text hover:underline">
                página de vendas
              </Link>
              .
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {models.map((m) => (
                <Card key={m.name}>
                  <CardContent className="flex flex-col gap-2 p-4 sm:p-4">
                    <h3 className="text-[15px] font-semibold">{m.name}</h3>
                    <span className="self-start rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary-text">{m.validation!.label}</span>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{m.validation!.summary}</p>
                    <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12.5px] leading-relaxed text-warning-text">{m.validation!.caveats}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>

          <Section id="planos" icon={<FileText />} title="Planos e preços">
            <p className="text-sm text-muted-foreground">
              Assinatura mensal, cancelamento a qualquer momento e arrependimento em até 7 dias com reembolso integral. O PRO tem {facts.trialDays} dias grátis, sem cartão; o ELITE não tem teste.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {(["PRO", "ELITE"] as const).map((p) => (
                <Card key={p}>
                  <CardContent className="p-4 sm:p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[15px] font-semibold">{p}</h3>
                      <span className="tabular text-sm">
                        <strong className="text-lg">{formatBRL(facts.prices[p])}</strong> /mês
                      </span>
                    </div>
                    <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                      {PLAN_FEATURES[p].map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> <span className="min-w-0">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Link href="/planos" className="self-start text-sm font-medium text-primary-text hover:underline">
              Ver planos e assinar
            </Link>
          </Section>

          <Section id="fontes" icon={<Database />} title="De onde vêm os dados">
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {DATA_SOURCES.map((d) => (
                <li key={d.name} className="rounded-lg border border-border bg-card px-3 py-2">
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-muted-foreground">: {d.use}</span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted-foreground">
              Cada número mostra a fonte e o horário do dado. O estado das fontes fica em{" "}
              <Link href="/status" className="text-primary-text hover:underline">
                Status do sistema
              </Link>
              .
            </p>
          </Section>

          <Section id="contato" icon={<LifeBuoy />} title="Fornecedor e contato">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Os dados do fornecedor e o e-mail de atendimento estão nos{" "}
              <Link href="/termos" className="text-primary-text hover:underline">
                Termos de Uso
              </Link>{" "}
              (seção 1). Com a conta aberta, os chamados são feitos em{" "}
              <Link href="/suporte" className="text-primary-text hover:underline">
                Suporte
              </Link>
              . Veja também a{" "}
              <Link href="/privacidade" className="text-primary-text hover:underline">
                Política de Privacidade
              </Link>{" "}
              e a política de{" "}
              <Link href="/reembolso" className="text-primary-text hover:underline">
                Cancelamento e Reembolso
              </Link>
              .
            </p>
          </Section>

          <section id="faq" aria-labelledby="sobre-faq" className="scroll-mt-20">
            <h2 id="sobre-faq" className="text-lg font-semibold tracking-[-0.01em]">
              Perguntas frequentes
            </h2>
            <FaqList items={faq} compact />
          </section>

          <p className="text-[13px] text-muted-foreground">
            Termos técnicos explicados no{" "}
            <Link href="/glossario" className="text-primary-text hover:underline">
              Glossário
            </Link>
            . Para assistentes de IA: resumo em{" "}
            <a href="/llms.txt" className="text-primary-text hover:underline">
              llms.txt
            </a>{" "}
            e texto completo em{" "}
            <a href="/llms-full.txt" className="text-primary-text hover:underline">
              llms-full.txt
            </a>
            .
          </p>
          <p className="text-xs text-muted-foreground">{INVESTMENT_DISCLAIMER}</p>
        </article>
      </PageShell>
    </>
  );
}
