import { z } from "zod";
import { symbolSchema } from "@/agents/schemas";
import { STRATEGIES } from "@/agents/strategies";

const strategyKeys = STRATEGIES.map((s) => s.key) as [string, ...string[]];

/** Schema do formulário de criação/edição de Agente (wizard de 5 passos). */
export const agentBodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  icon: z.string().trim().min(1).max(4).default("🤖"),
  description: z.string().trim().max(300).optional().nullable(),
  symbols: z.array(symbolSchema).min(1).max(20),
  operationType: z.enum(["day_trade", "swing_trade"]),
  timeframe: z.enum(["15m", "30m", "1h", "4h", "1d", "1w"]),
  strategies: z.array(z.enum(strategyKeys)).min(1).max(8),
  minConfidence: z.number().int().min(50).max(95).default(70),
  notification: z.enum(["log", "telegram", "both"]).default("log"),
});

export type AgentBody = z.infer<typeof agentBodySchema>;
