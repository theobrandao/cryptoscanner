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

export function organizationLd(): Ld {
  return { "@context": "https://schema.org", "@type": "Organization", "@id": ORG_ID, name: "CryptoScanner", url: abs("/"), logo: abs("/brand/logo.png") };
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
