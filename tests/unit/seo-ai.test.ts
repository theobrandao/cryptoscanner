import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { FaqList } from "@/components/marketing/faq-list";
import { aboutFaq } from "@/lib/content/about";
import { GLOSSARY, termsForLesson, termsForTutorial } from "@/lib/content/glossary";
import { getLesson, LESSONS, lessonPath } from "@/lib/content/lessons";
import { getTutorial, TUTORIALS, tutorialPath } from "@/lib/content/tutorials";
import { resetEnvCache, siteVerification } from "@/lib/env";
import { landingFaq, salesFaq, type FaqItem } from "@/lib/marketing/faq";
import { aboutPageLd, breadcrumbLd, courseLd, definedTermSetLd, faqPageLd, howToLd, lessonLd, organizationLd, softwareApplicationLd, tutorialsIndexLd, websiteLd } from "@/lib/seo/json-ld";
import { buildLlmsFullTxt, buildLlmsTxt, llmsContext } from "@/lib/seo/llms";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, fullTitle, lessonSeo, PAGE_SEO, TITLE_MAX, tutorialSeo } from "@/lib/seo/pages";
import { NAMED_CRAWLERS } from "@/lib/seo/robots";
import { isOpenRoute, SITE_URL } from "@/lib/site";

const ctx = llmsContext();
const abs = (p: string) => `${SITE_URL}${p}`;

describe("llms.txt", () => {
  const txt = buildLlmsTxt(ctx);

  it("segue a convenção: H1, resumo em citação e seções com links", () => {
    expect(txt.startsWith("# CryptoScanner\n\n> ")).toBe(true);
    for (const h of ["## Produto", "## Planos e preços", "## Tutoriais", "## Jornada Trader", "## Políticas", "## Contato e suporte", "## Optional"]) expect(txt).toContain(h);
    expect(txt).toContain(`(${abs("/llms-full.txt")})`);
    expect(txt).toContain(`(${abs("/sobre")})`);
    expect(txt).toContain(`(${abs("/glossario")})`);
  });

  it("lista todos os tutoriais e todas as aulas com link", () => {
    for (const t of TUTORIALS) expect(txt).toContain(`](${abs(tutorialPath(t.slug))}): `);
    for (const l of LESSONS) expect(txt).toContain(`](${abs(lessonPath(l.slug))}): `);
  });

  it("traz preços dos planos vendidos, o aviso de investimento e nunca a chave interna", () => {
    expect(txt).toContain("PRO: R$ 97/mês");
    expect(txt).toContain("ELITE: R$ 197/mês");
    expect(txt).toMatch(/não é recomendação de investimento/);
    expect(txt).not.toMatch(/PLATINUM/i);
  });
});

describe("llms-full.txt", () => {
  const full = buildLlmsFullTxt(ctx);

  it("tem o texto completo das aulas e os passos dos tutoriais", () => {
    for (const l of LESSONS) {
      expect(full).toContain(`### Aula ${l.order}: ${l.title}`);
      for (const s of l.sections) expect(full).toContain(s.body);
    }
    for (const t of TUTORIALS) {
      expect(full).toContain(`### ${t.title}`);
      t.steps.forEach((s, i) => expect(full).toContain(`${i + 1}. ${s.title}: ${s.text}`));
    }
  });

  it("tem glossário, perguntas, ressalvas do modelo e avisos, sem a chave interna", () => {
    for (const g of GLOSSARY) expect(full).toContain(g.definition);
    for (const [q] of aboutFaq(ctx)) expect(full).toContain(`### ${q}`);
    expect(full).toMatch(/Resultado passado não garante resultado futuro/);
    expect(full).toMatch(/não é recomendação de investimento/);
    expect(full).not.toMatch(/PLATINUM/i);
  });
});

describe("glossário", () => {
  it("tem de 30 a 40 termos com ids únicos, em ordem alfabética", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(30);
    expect(GLOSSARY.length).toBeLessThanOrEqual(40);
    const ids = GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const names = GLOSSARY.map((t) => t.term);
    expect([...names].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))).toEqual(names);
  });

  it("aponta só para aulas e tutoriais que existem; cada aula tem termos", () => {
    for (const t of GLOSSARY) {
      for (const s of t.lessons) expect(getLesson(s), `${t.id} → aula ${s}`).toBeDefined();
      for (const s of t.tutorials) expect(getTutorial(s), `${t.id} → tutorial ${s}`).toBeDefined();
      expect(t.definition.length).toBeGreaterThan(60);
    }
    for (const l of LESSONS) expect(termsForLesson(l.slug).length, l.slug).toBeGreaterThan(0);
    expect(TUTORIALS.some((t) => termsForTutorial(t.slug).length > 0)).toBe(true);
  });

  it("DefinedTermSet repete os verbetes da página", () => {
    const ld = definedTermSetLd(GLOSSARY) as { "@type": string; hasDefinedTerm: Array<{ name: string; description: string; url: string }> };
    expect(ld["@type"]).toBe("DefinedTermSet");
    expect(ld.hasDefinedTerm.map((d) => d.name)).toEqual(GLOSSARY.map((t) => t.term));
    expect(ld.hasDefinedTerm[0]!.url).toBe(abs(`/glossario#${GLOSSARY[0]!.id}`));
  });
});

/** Pergunta e resposta como aparecem no HTML do FaqList (summary > span e p). */
function renderedFaq(items: FaqItem[]): Array<[string, string]> {
  const html = renderToStaticMarkup(createElement(FaqList, { items }));
  const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const qs = [...html.matchAll(/<summary[^>]*><span class="min-w-0">([\s\S]*?)<\/span>/g)].map((m) => decode(m[1]!));
  const as = [...html.matchAll(/<p class="[^"]*">([\s\S]*?)<\/p>/g)].map((m) => decode(m[1]!));
  return qs.map((q, i) => [q, as[i]!]);
}

describe("FAQPage = perguntas exibidas na página", () => {
  const cases: Array<[string, FaqItem[], string]> = [
    ["início", landingFaq(3), "/"],
    ["vendas (Kiwify)", salesFaq(3, true), "/vendas"],
    ["planos (Mercado Pago)", salesFaq(3, false), "/planos"],
    ["sobre", aboutFaq(ctx), "/sobre"],
  ];
  it.each(cases)("%s", (_name, items, path) => {
    const ld = faqPageLd(items, path) as { "@type": string; url: string; mainEntity: Array<{ "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }> };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.url).toBe(`${SITE_URL}${path === "/" ? "" : path}`);
    const fromLd = ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]);
    expect(fromLd).toEqual(renderedFaq(items));
    expect(ld.mainEntity.every((q) => q["@type"] === "Question" && q.acceptedAnswer["@type"] === "Answer")).toBe(true);
  });

  it("a página /sobre tem de 8 a 10 perguntas", () => {
    expect(aboutFaq(ctx).length).toBeGreaterThanOrEqual(8);
    expect(aboutFaq(ctx).length).toBeLessThanOrEqual(10);
  });
});

/** Procura chaves proibidas em qualquer nível do objeto. */
function deepKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => deepKeys(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      deepKeys(x, out);
    }
  return out;
}

describe("JSON-LD: formato e regras do projeto", () => {
  const lesson = LESSONS[0]!;
  const tutorial = TUTORIALS[0]!;
  const all = [
    organizationLd(),
    websiteLd(),
    softwareApplicationLd("/vendas"),
    courseLd(LESSONS, PAGE_SEO.jornada.description),
    lessonLd(lesson),
    howToLd(tutorial, null),
    tutorialsIndexLd(TUTORIALS),
    breadcrumbLd([["Início", "/"], ["Glossário", "/glossario"]]),
    faqPageLd(landingFaq(3), "/"),
    definedTermSetLd(GLOSSARY),
    aboutPageLd("definição", "2026-09-30"),
  ];

  it("todos têm @context schema.org e @type; nenhum traz nota, avaliação ou depoimento", () => {
    for (const ld of all) {
      expect(ld["@context"]).toBe("https://schema.org");
      expect(typeof ld["@type"]).toBe("string");
      const keys = deepKeys(ld);
      for (const k of ["aggregateRating", "review", "reviews", "ratingValue", "reviewCount"]) expect(keys.has(k), `${String(ld["@type"])} tem ${k}`).toBe(false);
      expect(JSON.stringify(ld)).not.toMatch(/PLATINUM/i);
    }
  });

  it("Organization: nome, url e logo /brand/logo.png", () => {
    const o = organizationLd() as { name: string; url: string; logo: { url: string } };
    expect(o.name).toBe("CryptoScanner");
    expect(o.url).toBe(SITE_URL);
    expect(o.logo.url).toBe(abs("/brand/logo.png"));
  });

  it("SoftwareApplication: FinanceApplication, Web e ofertas PRO/ELITE em BRL", () => {
    const s = softwareApplicationLd("/vendas") as { applicationCategory: string; operatingSystem: string; offers: Array<{ name: string; price: string; priceCurrency: string }> };
    expect(s.applicationCategory).toBe("FinanceApplication");
    expect(s.operatingSystem).toBe("Web");
    expect(s.offers.map((o) => [o.name, o.price, o.priceCurrency])).toEqual([
      ["PRO", "97.00", "BRL"],
      ["ELITE", "197.00", "BRL"],
    ]);
  });

  it("BreadcrumbList: posições em ordem e URLs absolutas", () => {
    const b = breadcrumbLd([["Início", "/"], ["Jornada Trader", "/jornada"], [lesson.title, lessonPath(lesson.slug)]]) as { itemListElement: Array<{ position: number; item: string; name: string }> };
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(b.itemListElement[0]!.item).toBe(SITE_URL);
    expect(b.itemListElement[2]!.item).toBe(abs(lessonPath(lesson.slug)));
  });
});

describe("robots.txt", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it("libera buscadores e assistentes de IA pelo nome", () => {
    const named = rules.flatMap((x) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent]));
    for (const ua of ["*", "Googlebot", "Bingbot", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Applebot", "Applebot-Extended"]) expect(named).toContain(ua);
    expect(NAMED_CRAWLERS.length).toBe(new Set(NAMED_CRAWLERS).size);
  });

  it("todo grupo libera / e fecha API, admin e contas; sitemap no domínio", () => {
    for (const x of rules) {
      expect(x.allow).toBe("/");
      for (const p of ["/api/", "/admin", "/preferencias", "/carteira"]) expect(x.disallow).toContain(p);
      for (const p of ["/sobre", "/glossario", "/jornada", "/ajuda", "/llms.txt"]) expect(x.disallow).not.toContain(p);
    }
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("páginas públicas: título, descrição, sitemap e acesso", () => {
  const pages = [...Object.values(PAGE_SEO), ...LESSONS.map(lessonSeo), ...TUTORIALS.map(tutorialSeo)];

  it.each(pages.map((p) => [p.path, p] as const))("%s: título ≤ 60 e descrição de 120 a 155", (_path, p) => {
    expect(fullTitle(p).length, fullTitle(p)).toBeLessThanOrEqual(TITLE_MAX);
    expect(p.description.length, p.description).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(p.description.length, p.description).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("títulos e descrições não se repetem", () => {
    expect(new Set(pages.map((p) => fullTitle(p))).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
  });

  it("/sobre e /glossario estão no sitemap e abertos sem conta; arquivos llms não entram no sitemap", () => {
    const urls = sitemap().map((u) => u.url);
    expect(urls).toContain(abs("/sobre"));
    expect(urls).toContain(abs("/glossario"));
    expect(urls.some((u) => u.includes("llms"))).toBe(false);
    expect(isOpenRoute("/sobre")).toBe(true);
    expect(isOpenRoute("/glossario")).toBe(true);
  });
});

describe("verificação dos buscadores", () => {
  const saved = { g: process.env.GOOGLE_SITE_VERIFICATION, b: process.env.BING_SITE_VERIFICATION };
  afterEach(() => {
    process.env.GOOGLE_SITE_VERIFICATION = saved.g ?? "";
    process.env.BING_SITE_VERIFICATION = saved.b ?? "";
    resetEnvCache();
  });

  it("sem variáveis, código padrão do Google; com variáveis, google e msvalidate.01", () => {
    process.env.GOOGLE_SITE_VERIFICATION = "";
    process.env.BING_SITE_VERIFICATION = "";
    resetEnvCache();
    expect(siteVerification()).toEqual({ google: "itO17eOlQLWE9pkG309GoHrJIheTLqqc4DkQpCNq2lA" });
    process.env.GOOGLE_SITE_VERIFICATION = "abcDEF123_-xyz789";
    process.env.BING_SITE_VERIFICATION = "0123456789ABCDEF0123456789ABCDEF";
    resetEnvCache();
    expect(siteVerification()).toEqual({ google: "abcDEF123_-xyz789", other: { "msvalidate.01": "0123456789ABCDEF0123456789ABCDEF" } });
  });

  it("valor fora do formato é ignorado sem derrubar o ambiente (usa o código padrão)", () => {
    process.env.GOOGLE_SITE_VERIFICATION = '"><script>';
    process.env.BING_SITE_VERIFICATION = "";
    resetEnvCache();
    expect(siteVerification()).toEqual({ google: "itO17eOlQLWE9pkG309GoHrJIheTLqqc4DkQpCNq2lA" });
  });
});
