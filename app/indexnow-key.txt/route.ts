import { getEnv } from "@/lib/env";

/**
 * /indexnow-key.txt — arquivo de verificação do IndexNow (keyLocation usado por tools/indexnow.mjs).
 * Devolve só a chave pública INDEXNOW_KEY (não é segredo: o protocolo exige publicá-la). Sem chave válida: 404.
 * Gerado no build; ao trocar a chave na Vercel, é preciso novo deploy.
 */
export const dynamic = "force-static";

export function GET() {
  let key: string | undefined;
  try {
    key = getEnv().INDEXNOW_KEY;
  } catch {
    key = undefined;
  }
  if (!key) return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
