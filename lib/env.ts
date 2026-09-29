import { z } from "zod";

/**
 * Validação centralizada das variáveis de ambiente do servidor.
 * Nunca importar este módulo em componentes cliente.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().default("CryptoScanner"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MARKET_PROVIDERS: z.string().default("binance,kraken"),
  BINANCE_REST_URL: z.string().default("https://api.binance.com"),
  /** Bases alternativas (vírgula). data-api.binance.vision = base oficial só de dados de mercado, sem bloqueio regional. */
  BINANCE_REST_FALLBACK_URLS: z.string().default("https://data-api.binance.vision"),
  BINANCE_WS_URL: z.string().default("wss://stream.binance.com:9443/stream"),
  BINANCE_WS_FALLBACK_URL: z.string().default("wss://data-stream.binance.vision:9443/stream"),
  /** Futures USDⓈ-M (derivativos públicos: funding, open interest, long/short) */
  BINANCE_FUTURES_REST_URL: z.string().default("https://fapi.binance.com"),
  KRAKEN_REST_URL: z.string().default("https://api.kraken.com"),
  COINGECKO_REST_URL: z.string().default("https://api.coingecko.com/api/v3"),
  COINGECKO_API_KEY: z.string().optional(),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(8000),
  FNG_URL: z.string().default("https://api.alternative.me/fng/"),
  NEWS_RSS_URLS: z.string().default("https://cointelegraph.com/rss,https://www.coindesk.com/arc/outboundfeeds/rss"),
  LLM_PROVIDER: z.enum(["none", "anthropic"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-sonnet-4-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  WORKER_CYCLE_SECONDS: z.coerce.number().int().min(30).default(300),
  AGENT_ALERT_COOLDOWN_MINUTES: z.coerce.number().int().min(1).default(30),
  WORKER_ENABLE_BINANCE_WS: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  RATE_LIMIT_PUBLIC_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_LLM_PER_MINUTE: z.coerce.number().int().min(1).default(5),
  ALLOW_SELF_PLAN_CHANGE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  /** Uso pessoal: se definido, o cadastro exige este código de convite. */
  REGISTRATION_INVITE_CODE: z.string().min(8).optional(),
  /** E-mails do dono (vírgula): recebem ADMIN + PLATINUM no cadastro e no login. */
  OWNER_EMAILS: z.string().default(""),
  /** Aceita o segredo do cron em ?secret= (legado). Desligar depois de migrar os agendamentos para cabeçalho. */
  CRON_ALLOW_QUERY_SECRET: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  /** Web Push (VAPID). Gerar com: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  /** Mercado Pago (assinaturas). Sem token, o checkout fica desativado e o app informa. */
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  PRICE_PRO_BRL: z.coerce.number().positive().default(97),
  PRICE_ELITE_BRL: z.coerce.number().positive().default(197),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variáveis de ambiente inválidas: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Usado em testes para recarregar o ambiente. */
export function resetEnvCache(): void {
  cached = null;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getEnv().DATABASE_URL);
}

export function isLlmConfigured(): boolean {
  const env = getEnv();
  return env.LLM_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY);
}

export function isTelegramConfigured(): boolean {
  return Boolean(getEnv().TELEGRAM_BOT_TOKEN);
}

export function getMarketProviderOrder(): Array<"binance" | "kraken"> {
  const raw = getEnv()
    .MARKET_PROVIDERS.split(",")
    .map((s) => s.trim().toLowerCase());
  const order = raw.filter((p): p is "binance" | "kraken" => p === "binance" || p === "kraken");
  return order.length > 0 ? order : ["binance", "kraken"];
}

export function isOwnerEmail(email: string): boolean {
  return getEnv()
    .OWNER_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

/** Cadastro restrito (uso pessoal): há código de convite ou lista de e-mails do dono. */
export function isInviteRequired(): boolean {
  const env = getEnv();
  return Boolean(env.REGISTRATION_INVITE_CODE) || env.OWNER_EMAILS.trim().length > 0;
}
