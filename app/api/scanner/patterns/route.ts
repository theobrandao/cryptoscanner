import { ok, withApi } from "@/lib/api";
import { PATTERN_LIST } from "@/lib/patterns/catalog";

export const GET = withApi(async () => ok({ patterns: PATTERN_LIST }));
