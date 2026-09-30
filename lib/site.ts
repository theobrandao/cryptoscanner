/** URL pública canônica do site (metadados, sitemap, robots). Em ambiente local cai no domínio de produção. */
const raw = process.env.NEXT_PUBLIC_APP_URL ?? "";
export const SITE_URL = (/^https:\/\//.test(raw) ? raw : "https://www.cryptoscanner.com.br").replace(/\/+$/, "");

/**
 * Páginas abertas sem plano: venda, conta, documentos, Jornada, tutoriais (/ajuda), sobre, glossário e estado do sistema. Todo o resto exige teste
 * ativo ou plano pago (AccessGate). "/visitante" é a Início estática do visitante, servida em "/" pelo proxy.
 */
export const OPEN_ROUTES = ["/jornada", "/ajuda", "/sobre", "/glossario", "/vendas", "/visitante", "/planos", "/login", "/registro", "/esqueci-senha", "/redefinir-senha", "/termos", "/privacidade", "/reembolso", "/status", "/suporte", "/preferencias", "/admin"];

export function isOpenRoute(href: string): boolean {
  const p = href.split(/[?#]/)[0] || "/";
  return p === "/" || OPEN_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

const LOGIN_ONLY = ["/preferencias", "/admin"];

/** Link para ferramenta fechada (ou página de conta) sem sessão: sem pré-carregamento, o visitante só veria o bloqueio. */
export function prefetchFor(href: string, loggedIn: boolean): false | undefined {
  if (loggedIn) return undefined;
  const p = href.split(/[?#]/)[0] || "/";
  return isOpenRoute(p) && !LOGIN_ONLY.some((r) => p === r || p.startsWith(r + "/")) ? undefined : false;
}
