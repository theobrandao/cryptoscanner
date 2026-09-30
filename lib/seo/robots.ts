/**
 * Regras do robots.txt (app/robots.ts), num módulo à parte para os testes e para não exportar nada além do padrão
 * a partir do arquivo de rota. Ver o comentário em app/robots.ts.
 */
export const DISALLOWED_PATHS = ["/api/", "/admin", "/preferencias", "/carteira", "/redefinir-senha", "/esqueci-senha", "/suporte"];

/** Buscadores e assistentes de IA citados nominalmente (mesmas regras do grupo "*"). */
export const NAMED_CRAWLERS = [
  // buscadores
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  // Google Gemini / AI Overviews (controle de uso do conteúdo)
  "Google-Extended",
  // OpenAI (ChatGPT): treino, busca e navegação a pedido do usuário
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic (Claude)
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Apple Intelligence
  "Applebot-Extended",
  // Common Crawl (base de vários modelos)
  "CCBot",
];
