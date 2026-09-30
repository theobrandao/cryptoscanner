import { buildLlmsFullTxt, LLMS_HEADERS } from "@/lib/seo/llms";

/** /llms-full.txt — texto completo (aulas, tutoriais, planos, perguntas, glossário e avisos) para assistentes de IA, gerado no build. */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsFullTxt(), { headers: LLMS_HEADERS });
}
