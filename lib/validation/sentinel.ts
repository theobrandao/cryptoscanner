import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";

/** Estratégias que o Sentinela executa: multipadrão com plano de trade + confluência técnica. */
export const SENTINEL_STRATEGIES = ["sentinel_patterns", "confluence"] as const;

export const sentinelBodySchema = z.object({
  symbol: symbolSchema,
  timeframe: z.enum(["4h", "1d", "1w"]).default("4h"),
  minConfidence: z.number().int().min(50).max(95).default(70),
  notification: z.enum(["log", "telegram", "both"]).default("log"),
});

export type SentinelBody = z.infer<typeof sentinelBodySchema>;
