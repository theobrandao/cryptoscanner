import { LEVEL_LABEL, type Lesson } from "@/lib/content/lessons";
import { getEnv } from "@/lib/env";
import { SITE_URL } from "@/lib/site";

/**
 * Dados estruturados (schema.org) das páginas públicas, como recomenda o guia de JSON-LD do Next:
 * `<script type="application/ld+json">` na própria página, com "<" escapado.
 * Regra do projeto: sem nota média, contagem de usuários ou depoimentos.
 */
type Ld = Record<string, unknown>;

export function JsonLd({ data }: { data: Ld | Ld[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;
const ORG_ID = `${SITE_URL}/#organizacao`;
const SITE_ID = `${SITE_URL}/#site`;
const COURSE_ID = `${SITE_URL}/jornada#curso`;

const ORG_REF = { "@id": ORG_ID };

/** E-mail de atendimento publicado nos documentos legais (SUPPORT_EMAIL); sem ele, o Organization sai sem contactPoint. */
function supportEmail(): string | null {
  try {
    const e = getEnv().SUPPORT_EMAIL?.trim();
    return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  } catch {
    return null;
  }
}

export function organizationLd(): Ld {
  const email = supportEmail();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "CryptoScanner",
    url: abs("/"),
    logo: { "@type": "ImageObject", url: abs("/brand/logo.png") },
    description: "Aplicação web brasileira de análise técnica de criptomoedas: padrões gráficos, modelo de rompimento testado fora da amostra, alertas e aulas. Não é corretora nem recomendação de investimento.",
    ...(email ? { contactPoint: { "@type": "ContactPoint", contactType: "customer support", email, url: abs("/suporte"), availableLanguage: ["Portuguese"] } } : {}),
  };
}

export function websiteLd(): Ld {
  return { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE_ID, name: "CryptoScanner", url: abs("/"), inLanguage: "pt-BR", publisher: ORG_REF };
}

/** Preços aprovados: os valores de lib/env (PRICE_PRO_BRL / PRICE_ELITE_BRL). Sem ambiente válido, sai sem ofertas. */
function planPrices(): { PRO: number; ELITE: number } | null {
  try {
    const env = getEnv();
    return { PRO: env.PRICE_PRO_BRL, ELITE: env.PRICE_ELITE_BRL };
  } catch {
    return null;
  }
}

export function softwareApplicationLd(path: string): Ld {
  const prices = planPrices();
  const offer = (name: string, price: number) => ({ "@type": "Offer", name, price: price.toFixed(2), priceCurrency: "BRL", url: abs("/planos"), category: "Assinatura mensal", availability: "https://schema.org/InStock" });
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CryptoScanner",
    url: abs(path),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    description: "Aplicação web de análise técnica de criptomoedas: padrões gráficos, modelo de rompimento testado fora da amostra, agentes com alertas e aulas. Não é recomendação de investimento.",
    publisher: ORG_REF,
    ...(prices ? { offers: [offer("PRO", prices.PRO), offer("ELITE", prices.ELITE)] } : {}),
  };
}

export function courseLd(lessons: Lesson[], description: string): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": COURSE_ID,
    name: "Jornada Trader",
    description,
    url: abs("/jornada"),
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: "CryptoScanner", url: abs("/") },
    offers: { "@type": "Offer", category: "Free", price: "0", priceCurrency: "BRL" },
    hasPart: lessons.map((l) => ({ "@type": "LearningResource", name: l.title, url: abs(`/jornada/${l.slug}`), position: l.order })),
  };
}

export function lessonLd(lesson: Lesson): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: lesson.title,
    description: lesson.summary,
    url: abs(`/jornada/${lesson.slug}`),
    inLanguage: "pt-BR",
    learningResourceType: "Aula",
    educationalLevel: LEVEL_LABEL[lesson.level],
    timeRequired: `PT${lesson.minutes}M`,
    isAccessibleForFree: true,
    position: lesson.order,
    teaches: lesson.keyPoints,
    isPartOf: { "@type": "Course", "@id": COURSE_ID, name: "Jornada Trader", url: abs("/jornada") },
    provider: { "@type": "Organization", name: "CryptoScanner", url: abs("/") },
  };
}

/** Tutorial da Central de ajuda (HowTo): passos do texto e, quando existem, as imagens e o vídeo da captura. */
export function howToLd(
  t: { slug: string; title: string; summary: string; steps: Array<{ title: string; text: string }> },
  media: { cover: { src: string } | null; poster: { src: string } | null; video: { src: string } | null; capturedAt: string | null; stepImages: Array<{ src: string } | null> } | null,
): Ld {
  const url = abs(`/ajuda/${t.slug}`);
  const thumb = media?.poster?.src ?? media?.cover?.src ?? null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t.title,
    description: t.summary,
    url,
    inLanguage: "pt-BR",
    ...(media?.cover ? { image: abs(media.cover.src) } : {}),
    ...(media?.video && thumb && media.capturedAt
      ? { video: { "@type": "VideoObject", name: t.title, description: t.summary, thumbnailUrl: abs(thumb), contentUrl: abs(media.video.src), uploadDate: media.capturedAt, inLanguage: "pt-BR" } }
      : {}),
    step: t.steps.map((s, i) => {
      const img = media?.stepImages[i];
      return { "@type": "HowToStep", position: i + 1, name: s.title, text: s.text, url: `${url}#passo-${i + 1}`, ...(img ? { image: abs(img.src) } : {}) };
    }),
    publisher: ORG_REF,
  };
}

/** Lista da Central de tutoriais (ItemList com a URL de cada tutorial). */
export function tutorialsIndexLd(items: Array<{ slug: string; title: string }>): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Central de tutoriais do CryptoScanner",
    url: abs("/ajuda"),
    inLanguage: "pt-BR",
    publisher: ORG_REF,
    mainEntity: { "@type": "ItemList", itemListElement: items.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.title, url: abs(`/ajuda/${t.slug}`) })) },
  };
}

/** Trilha de navegação (BreadcrumbList): [nome, caminho] do início até a página atual. */
export function breadcrumbLd(items: Array<[string, string]>): Ld {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })) };
}

/** Perguntas frequentes (FAQPage): recebe os MESMOS itens exibidos na página (lib/marketing/faq.ts, lib/content/about.ts). */
export function faqPageLd(items: ReadonlyArray<readonly [string, string]>, path: string): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: abs(path),
    inLanguage: "pt-BR",
    mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

/** Glossário (DefinedTermSet com um DefinedTerm por verbete, cada um com a âncora da página). */
export function definedTermSetLd(terms: ReadonlyArray<{ id: string; term: string; definition: string }>): Ld {
  const url = abs("/glossario");
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${url}#glossario`,
    name: "Glossário de análise técnica e cripto",
    url,
    inLanguage: "pt-BR",
    publisher: ORG_REF,
    hasDefinedTerm: terms.map((t) => ({ "@type": "DefinedTerm", "@id": `${url}#${t.id}`, name: t.term, description: t.definition, url: `${url}#${t.id}`, inDefinedTermSet: `${url}#glossario` })),
  };
}

/** Página "O que é o CryptoScanner" (AboutPage sobre a organização e o aplicativo). */
export function aboutPageLd(description: string, dateModified: string): Ld {
  return { "@context": "https://schema.org", "@type": "AboutPage", name: "O que é o CryptoScanner", url: abs("/sobre"), inLanguage: "pt-BR", description, dateModified, about: ORG_REF, publisher: ORG_REF };
}
