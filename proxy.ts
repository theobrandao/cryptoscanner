import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy do Next 16 (antigo middleware), só em duas rotas públicas:
 *  - "/": visitante sem o cookie de sessão recebe a página estática /visitante (cacheável na CDN); quem tem
 *    sessão segue para a Início dinâmica. Links antigos "/?symbol=…" continuam no app/page.tsx (redirecionamento).
 *    A URL e os parâmetros (utm, afiliado) ficam como vieram; a captura de afiliado roda no navegador.
 *  - "/jornada?aula=slug": endereço antigo das aulas, redireciona de forma permanente para /jornada/slug.
 * O nome do cookie repete SESSION_COOKIE (lib/auth.ts) para não levar o módulo de autenticação ao proxy.
 */
const SESSION_COOKIE = "cs_session";

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname === "/jornada") {
    const slug = url.searchParams.get("aula");
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.next();
    const target = url.clone();
    target.pathname = `/jornada/${slug}`;
    target.searchParams.delete("aula");
    return NextResponse.redirect(target, 308);
  }
  if (url.pathname === "/" && !request.cookies.get(SESSION_COOKIE)?.value && !url.searchParams.has("symbol")) {
    const target = url.clone();
    target.pathname = "/visitante";
    return NextResponse.rewrite(target);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/jornada"] };
