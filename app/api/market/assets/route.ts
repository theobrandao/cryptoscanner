import { ok, withApi } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { PATTERN_LIST } from "@/lib/patterns/catalog";
import { TIMEFRAMES } from "@/types/market";

/** Universo de ativos, timeframes e catálogo de padrões (dados estáticos do projeto). */
export const GET = withApi(async () => {
  return ok({ assets: ASSETS, timeframes: TIMEFRAMES, patterns: PATTERN_LIST });
});
