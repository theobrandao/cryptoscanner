import { buildLlmsTxt, LLMS_HEADERS } from "@/lib/seo/llms";

/** /llms.txt — resumo do site para assistentes de IA (llmstxt.org), gerado no build a partir dos módulos de conteúdo. */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(), { headers: LLMS_HEADERS });
}
