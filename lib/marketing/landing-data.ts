import type { LandingData } from "@/components/marketing/landing";
import { ASSETS } from "@/lib/assets";
import { LESSONS } from "@/lib/content/lessons";
import curves from "@/lib/content/validation-curves.json";
import { PATTERN_KEYS } from "@/lib/patterns/catalog";
import { STRATEGY_TEMPLATES, executionTf } from "@/lib/strategies/definition";

/** Dados estáticos das páginas de venda (servidor): modelos validados com curva fora da amostra, aulas, contagens. */
export function buildLandingData(): LandingData {
  const curveOf = (tf: string) => ((curves as unknown as Record<string, { points: number[][] }>)[tf]?.points ?? []).map((p) => p[1] as number);
  return {
    validated: STRATEGY_TEMPLATES.filter((t) => t.validation).map((t) => ({ name: t.name, description: t.description, tf: executionTf(t.definition).toUpperCase(), validation: t.validation!, curve: curveOf(executionTf(t.definition)) })),
    lessons: LESSONS.map((l) => ({ title: l.title, level: l.level, minutes: l.minutes, summary: l.summary })),
    patterns: PATTERN_KEYS.length,
    assets: ASSETS.length,
  };
}
